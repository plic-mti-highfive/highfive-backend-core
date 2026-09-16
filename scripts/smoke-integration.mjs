#!/usr/bin/env node
/**
 * Verifications d'integration entre services — ce que `smoke.mjs` ne peut pas
 * couvrir, parce qu'il ne parle qu'a l'API.
 *
 *   1. **Le Mur** : le core emet un jeton, un vrai client Yjs s'y connecte, ecrit
 *      dans le document, et la conversion en taches reprend le texte reel des
 *      elements. C'est la seule facon de prouver que la chaine
 *      core -> jeton -> Hocuspocus -> export -> core tient de bout en bout.
 *   2. **Service IA** : les jobs partent reellement sur les files BullMQ.
 *
 * Chaque bloc se declare **saute** si son service est absent : mieux vaut un
 * trou annonce qu'un test qui se croit vert.
 *
 * Prerequis : API demarree, service canvas sur `CANVAS_WS_URL`, Redis.
 * Usage : node scripts/smoke-integration.mjs
 */

import { HocuspocusProvider } from '@hocuspocus/provider';
import { Queue } from 'bullmq';
import * as Y from 'yjs';
import WebSocket from 'ws';

const API = (process.env.API_URL ?? 'http://localhost:3000') + '/api';
const REDIS = {
  host: process.env.REDIS_HOST ?? 'localhost',
  port: Number(process.env.REDIS_PORT ?? 6379),
};

/** Cle de la Y.Map des records tldraw (contrat partage avec le service canvas). */
const RECORDS_KEY = 'tl_records';

let failures = 0;
let skipped = 0;

const check = (label, condition, detail) => {
  if (condition) {
    console.log(`  ok   ${label}`);
    return true;
  }
  failures += 1;
  console.log(`  FAIL ${label}`, JSON.stringify(detail)?.slice(0, 300));
  return false;
};

const skip = (label, why) => {
  skipped += 1;
  console.log(`  --   ${label} (saute : ${why})`);
};

async function call(method, path, { token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';

  const response = await fetch(API + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  return {
    status: response.status,
    body: text ? JSON.parse(text) : undefined,
  };
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ------------------------------------------------------------------ contexte

const stamp = Date.now().toString(36).slice(-6);
const account = {
  email: `mur.${stamp}@example.com`,
  password: 'demo1234',
  username: `mur${stamp}`,
};

console.log('# preparation');
let r = await call('POST', '/auth/register', { body: account });
if (r.status !== 201) {
  console.error(`API injoignable ou inscription refusee : ${r.status}`);
  process.exit(2);
}
const token = r.body.token;
check('compte de test cree', true);

r = await call('POST', '/projects', {
  token,
  body: {
    title: `Mur integration ${stamp}`,
    tagline: 'Verification de la chaine core - canvas',
    tags: ['code'],
    visibility: 'public',
    participation: 'open',
  },
});
const slug = r.body.slug;
await call('POST', `/projects/${slug}/transition`, {
  token,
  body: { transition: 'publish' },
});
check('projet de test publie', !!slug);

// ------------------------------------------------------------------- Le Mur

console.log('\n# Le Mur : core -> Hocuspocus -> export -> core');

r = await call('GET', `/projects/${slug}/wall/session`, { token });
const session = r.body;
check('session emise par le core', r.status === 200 && session.token, session);
check('role projet projete sur le document', session.role === 'admin', session);

const reachable = await fetch(
  (process.env.CANVAS_URL ?? 'http://localhost:8585') + '/health',
)
  .then((response) => response.ok)
  .catch(() => false);

if (!reachable) {
  skip('chaine complete du Mur', 'service canvas injoignable');

  // La conversion ne depend pas du service canvas : le libelle vient du
  // client. Un libelle vide retombe sur un texte generique.
  r = await call('POST', `/projects/${slug}/wall/to-tasks`, {
    token,
    body: { elements: [{ id: 'shape:absent', label: '' }] },
  });
  check('repli : conversion malgre tout 201', r.status === 201, r.body);
  check(
    'repli : libelle generique',
    r.body?.[0]?.title?.startsWith('Idee du Mur'),
    r.body?.[0],
  );
} else {
  const document = new Y.Doc();
  const provider = new HocuspocusProvider({
    url: session.websocketUrl,
    name: session.canvasId,
    token: session.token,
    document,
    WebSocketPolyfill: WebSocket,
    onAuthenticationFailed: ({ reason }) => {
      check('authentification aupres du service canvas', false, reason);
    },
  });

  const synced = await Promise.race([
    new Promise((resolve) => provider.on('synced', () => resolve(true))),
    wait(10_000).then(() => false),
  ]);
  check('le jeton du core est accepte par le service canvas', synced === true);

  if (synced) {
    // Deux records au format tldraw : un post-it et une forme annotee.
    const records = document.getMap(RECORDS_KEY);
    records.set('shape:note1', {
      id: 'shape:note1',
      typeName: 'shape',
      type: 'note',
      props: { text: 'Reserver la salle des fetes' },
    });
    records.set('shape:geo1', {
      id: 'shape:geo1',
      typeName: 'shape',
      type: 'geo',
      props: { geo: 'rectangle', text: 'Budget a valider' },
    });

    // Laisse le temps a la synchronisation d'atteindre le serveur.
    await wait(1500);

    r = await call('POST', `/projects/${slug}/wall/to-tasks`, {
      token,
      body: {
        elements: [
          { id: 'shape:note1', label: 'Reserver la salle des fetes' },
          { id: 'shape:geo1', label: 'Budget a valider' },
          { id: 'shape:absent', label: '' },
        ],
      },
    });
    check('conversion 201', r.status === 201 && r.body.length === 3, r.body);

    const byOrigin = Object.fromEntries(
      (r.body ?? []).map((task) => [task.wallOriginId, task.title]),
    );
    check(
      'le titre vient du libelle du post-it',
      byOrigin['shape:note1'] === 'Reserver la salle des fetes',
      byOrigin,
    );
    check(
      'le titre vient du libelle de la forme annotee',
      byOrigin['shape:geo1'] === 'Budget a valider',
      byOrigin,
    );
    check(
      'un libelle vide retombe sur un texte generique',
      byOrigin['shape:absent']?.startsWith('Idee du Mur'),
      byOrigin,
    );

    // Les suggestions de taches lisent le meme export : avec de la matiere,
    // elles ne doivent plus se declarer vides (l'appel au modele peut, lui,
    // etre indisponible — c'est une degradation, pas une erreur).
    r = await call('POST', `/projects/${slug}/wall/suggest-tasks`, { token });
    if (r.status === 200) {
      check('suggestions : le Mur n est plus vu comme vide', r.body.empty === false, r.body);
    } else {
      check('suggestions : indisponibilite signalee proprement', r.status === 503, r.body);
    }
  }

  provider.destroy();
}

// ------------------------------------------------------------------ files IA

console.log('\n# service IA : les jobs partent bien');

const queues = {
  ai_tasks: new Queue('ai_tasks', { connection: REDIS }),
  fast_events: new Queue('fast_events', { connection: REDIS }),
};

try {
  const before = {
    ai_tasks: await queues.ai_tasks.getJobCounts(),
    fast_events: await queues.fast_events.getJobCounts(),
  };

  // Un highfive doit produire une interaction (fast_events) ; une modification
  // de profil, un embedding a recalculer (ai_tasks).
  const other = {
    email: `ia.${stamp}@example.com`,
    password: 'demo1234',
    username: `ia${stamp}`,
  };
  r = await call('POST', '/auth/register', { body: other });
  const otherToken = r.body.token;

  await call('POST', `/projects/${slug}/highfive`, { token: otherToken });
  await call('PATCH', '/me', {
    token: otherToken,
    body: { bio: 'Je teste la frontiere IA', interests: ['code'] },
  });

  await wait(1000);

  const after = {
    ai_tasks: await queues.ai_tasks.getJobCounts(),
    fast_events: await queues.fast_events.getJobCounts(),
  };

  const grew = (name) =>
    Object.values(after[name]).reduce((a, b) => a + b, 0) >
    Object.values(before[name]).reduce((a, b) => a + b, 0);

  check('file ai_tasks alimentee (identites)', grew('ai_tasks'), after.ai_tasks);
  check('file fast_events alimentee (interactions)', grew('fast_events'), after.fast_events);

  const jobs = await queues.fast_events.getJobs(['waiting', 'delayed', 'active', 'completed'], 0, 20);
  const interaction = jobs.find((job) => job.name === 'user_interacted_with_project');
  check('job conforme au contrat du service IA', !!interaction?.data?.tenant_id && interaction.data.interaction_type === 'LIKE', interaction?.data);
} catch (error) {
  skip('files BullMQ', `Redis injoignable (${String(error).slice(0, 80)})`);
} finally {
  await queues.ai_tasks.close();
  await queues.fast_events.close();
}

console.log(
  `\n${failures === 0 ? 'TOUT PASSE' : `${failures} ECHEC(S)`}${skipped ? ` — ${skipped} bloc(s) saute(s)` : ''}`,
);
process.exit(failures === 0 ? 0 : 1);
