#!/usr/bin/env node
/**
 * Jeu de demonstration « comme en production » : une centaine de personnes,
 * une soixantaine de projets et quatre mois d'historique (highfives,
 * candidatures, commentaires, annonces, projets termines ou archives).
 *
 * Deroulement :
 *  1. Le monde est simule hors ligne, de facon deterministe (graine fixe) :
 *     qui s'inscrit quand, qui porte quoi, qui soutient quoi et a quelle date.
 *     Les gens soutiennent surtout ce qui recoupe leurs centres d'interet, et
 *     quelques projets connaissent une rafale recente (la « tendance »).
 *  2. Comptes et projets sont crees par l'API publique : les regles metier
 *     s'appliquent, et le core emet les jobs d'embedding vers le service IA.
 *  3. On attend que le worker IA ait calcule les vecteurs d'identite (vrais
 *     embeddings OpenAI), sans quoi les interactions qui suivent seraient
 *     perdues pour les vecteurs d'interet.
 *  4. Les evenements sont rejoues par l'API **dans l'ordre chronologique** :
 *     la moyenne mobile des vecteurs d'interet (EMA du service IA) suit donc
 *     l'histoire simulee.
 *  5. Une fois les files IA videes, les dates sont reecrites en base (core et
 *     table `embeddings`) : l'API n'accepte pas de date en entree, et le
 *     trending de l'IA lit l'age du dernier highfive dans `updated_at`.
 *
 * Idempotent : un compte existant retombe sur la connexion, un projet existant
 * est retrouve par son slug, et seuls les projets crees par ce lancement
 * recoivent un historique. Relancer sur une base deja seedee ne change rien.
 *
 * Sans acces a la base (DB_*), les etapes 3 et 5 sont sautees : le jeu reste
 * coherent, mais tout est date d'aujourd'hui. Sans cle OpenAI cote IA,
 * l'attente de l'etape 3 s'arrete vite et les recommandations retombent sur
 * les regles deterministes du core.
 *
 * Usage : node scripts/seed.mjs                 (API demarree)
 *         SEED_DRY_RUN=1 node scripts/seed.mjs  (statistiques du monde simule, sans reseau)
 *
 * Variables : API_URL, SEED_PEOPLE (100), SEED_AI_WAIT_S (300, 0 = pas
 * d'attente), DB_HOST/DB_PORT/DB_USERNAME/DB_PASSWORD/DB_DATABASE (memes
 * defauts que le core), AI_TENANT_ID.
 */

import { crc32, deflateSync } from 'node:zlib';
import {
  ANNOUNCEMENTS,
  BIO_BITS,
  COMMENTS,
  COMMUNITIES,
  CORE_PEOPLE,
  FIRST_NAMES,
  LAST_NAMES,
  PROJECTS,
  REPLIES,
} from './seed-data.mjs';

const API = (process.env.API_URL ?? 'http://localhost:3000') + '/api';
const PASSWORD = 'demo1234';
const PEOPLE_COUNT = Number(process.env.SEED_PEOPLE ?? 100);
const AI_WAIT_MS = Number(process.env.SEED_AI_WAIT_S ?? 300) * 1000;
const DRY_RUN = process.env.SEED_DRY_RUN === '1';
const TENANT_ID = process.env.AI_TENANT_ID ?? '00000000-0000-4000-8000-000000000001';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** Point d'ancrage de l'histoire : tout est date relativement a maintenant. */
const NOW = Date.now();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// Hasard deterministe : meme monde a chaque lancement.
// ---------------------------------------------------------------------------

function mulberry32(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20261007);
const pick = (list) => list[Math.floor(rand() * list.length)];
const shuffle = (list) => {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};
const between = (from, to) => from + (to - from) * rand();
const weighted = (items) => {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let roll = rand() * total;
  for (const item of items) {
    roll -= item.weight;
    if (roll <= 0) return item;
  }
  return items[items.length - 1];
};

const ascii = (text) =>
  text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');

/** Identique a src/modules/projects/slug.ts, pour deviner le slug avant creation. */
function slugify(title) {
  const base = title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 70);
  return base || 'projet';
}

const overlap = (a, b) => a.filter((tag) => b.includes(tag)).length;

// ---------------------------------------------------------------------------
// 1. Le monde simule
// ---------------------------------------------------------------------------

function buildPeople() {
  const people = CORE_PEOPLE.map((person) => ({ ...person }));
  const used = new Set(people.map((person) => person.username));
  const usedBios = new Set();

  while (people.length < PEOPLE_COUNT) {
    const first = pick(FIRST_NAMES);
    const last = pick(LAST_NAMES);
    let username = `${ascii(first)}.${ascii(last)}`.slice(0, 22);
    for (let n = 2; used.has(username); n++) username = `${username.slice(0, 21)}${n}`;
    used.add(username);

    const community = weighted(COMMUNITIES);
    const interests = shuffle(community.tags).slice(0, 2 + Math.floor(rand() * 3));
    if (rand() < 0.3) {
      const elsewhere = pick(COMMUNITIES.filter((c) => c !== community)).tags;
      const extra = pick(elsewhere);
      if (!interests.includes(extra)) interests.push(extra);
    }

    // Deux bouts de bio pris sur les deux premiers themes, sans doublon exact.
    let bio;
    for (let attempt = 0; attempt < 6; attempt++) {
      const a = pick(BIO_BITS[interests[0]]);
      const b = pick(BIO_BITS[interests[1]] ?? BIO_BITS[interests[0]]);
      bio = a === b ? a : `${a} ${b}`;
      if (!usedBios.has(bio)) break;
    }
    usedBios.add(bio);

    people.push({
      username,
      displayName: `${first} ${last}`,
      email: `${username}@example.com`,
      bio,
      interests,
    });
  }
  return people;
}

function buildWorld() {
  const people = buildPeople();
  const byName = new Map(people.map((person) => [person.username, person]));

  // Inscriptions : les cinq du front sont les pionniers, les autres arrivent
  // au fil des mois (plus nombreux au debut, comme apres un lancement).
  for (const person of people) {
    person.signupAt = CORE_PEOPLE.some((c) => c.username === person.username)
      ? NOW - between(115, 120) * DAY
      : NOW - (4 + 110 * rand() ** 0.7) * DAY;
  }

  // Porteurs : impose, sinon la personne la plus proche des themes du projet,
  // deux projets au plus chacun pour etaler les porteurs.
  const owned = new Map();
  const projects = PROJECTS.map((spec) => {
    let owner = spec.owner;
    if (!owner) {
      const candidates = people
        .filter((person) => (owned.get(person.username) ?? 0) < 2)
        .map((person) => ({
          person,
          score: overlap(person.interests, spec.tags) * 10 - (owned.get(person.username) ?? 0) * 6 + rand(),
        }))
        .sort((a, b) => b.score - a.score);
      owner = candidates[0].person.username;
    }
    owned.set(owner, (owned.get(owner) ?? 0) + 1);
    return { ...spec, owner, slug: slugify(spec.title), state: spec.state ?? 'active' };
  });

  const events = [];

  for (const project of projects) {
    const owner = byName.get(project.owner);
    const latest = NOW - 2 * DAY;
    project.createdAt = project.ageDays
      ? NOW - project.ageDays * DAY
      : owner.signupAt + DAY + (latest - owner.signupAt - DAY) * rand() ** 0.8;
    // Un porteur s'inscrit forcement avant de creer son projet.
    owner.signupAt = Math.min(owner.signupAt, project.createdAt - between(1, 6) * DAY);

    if (project.state === 'draft') continue;
    project.publishAt = project.createdAt + between(1, 48) * HOUR;
    events.push({ t: project.publishAt, kind: 'publish', project });

    if (project.state === 'done' || project.state === 'archived') {
      project.endAt = project.publishAt + (NOW - 3 * DAY - project.publishAt) * between(0.55, 0.85);
      events.push({ t: project.endAt, kind: project.state === 'done' ? 'complete' : 'archive', project });
    }
  }

  const team = new Map(projects.map((project) => [project.slug, new Set([project.owner])]));
  const commentsOf = new Map();
  const likesOf = new Map();

  for (const project of projects) {
    if (!project.publishAt || project.private) continue;
    const appeal = (project.hype ?? 1) * between(0.8, 1.2);
    const end = project.endAt ?? NOW - 10 * 60_000;

    for (const person of people) {
      if (person.username === project.owner) continue;
      const affinity = overlap(person.interests, project.tags);
      let chance = [0.02, 0.3, 0.55, 0.7][Math.min(affinity, 3)] * appeal;
      if (project.buzz && affinity > 0) chance += 0.15;
      if (rand() >= Math.min(chance, 0.92)) continue;

      const start = Math.max(project.publishAt, person.signupAt) + 30 * 60_000;
      if (start >= end) continue;

      // L'essentiel des soutiens arrive dans les jours qui suivent la
      // publication ; une rafale recente pour les projets « buzz ».
      let t;
      if (project.buzz && rand() < 0.4) {
        t = Math.max(start, NOW - 72 * HOUR * rand() ** 1.3);
      } else {
        t = start - Math.log(1 - rand()) * 9 * DAY;
        if (t > end) t = between(start, end);
      }
      t = Math.min(t, end);
      events.push({ t, kind: 'highfive', project, user: person.username });
      likesOf.set(project.slug, (likesOf.get(project.slug) ?? 0) + 1);

      // Candidature : rarement sans affinite, et equipes de dix au plus.
      const members = team.get(project.slug);
      if (affinity > 0 && rand() < 0.17 && members.size < 10) {
        const at = t + between(2, 96) * HOUR;
        if (at < end) {
          members.add(person.username);
          events.push({ t: at, kind: 'join', project, user: person.username, ...decision(project, at, end) });
        }
      }

      // Commentaire, et parfois la reponse du porteur.
      const comments = commentsOf.get(project.slug) ?? 0;
      if (comments < 10 && rand() < (affinity > 0 ? 0.16 : 0.06)) {
        const at = t + between(0.2, 40) * HOUR;
        if (at < end) {
          commentsOf.set(project.slug, comments + 1);
          const comment = { t: at, kind: 'comment', project, user: person.username, body: pick(COMMENTS) };
          events.push(comment);
          if (rand() < 0.45) {
            const replyAt = at + between(1, 30) * HOUR;
            if (replyAt < end) {
              events.push({ t: replyAt, kind: 'reply', project, user: project.owner, body: pick(REPLIES), parent: comment });
            }
          }
        }
      }
    }
  }

  // Les deux habitues du front rejoignent la fresque et le jardin : le canal
  // d'equipe de la fresque sert a la messagerie plus bas.
  for (const slug of [slugify(PROJECTS[0].title), slugify(PROJECTS[1].title)]) {
    const project = projects.find((p) => p.slug === slug);
    for (const username of ['marc.leroy', 'lea.m']) {
      if (team.get(slug).has(username)) continue;
      team.get(slug).add(username);
      const at = project.publishAt + between(2, 10) * DAY;
      events.push({ t: at, kind: 'join', project, user: username, ...decision(project, at, NOW) });
    }
  }

  // Annonces : les projets qui ont pris en ont publie une ou deux.
  for (const project of projects) {
    if (!project.publishAt || project.private) continue;
    const likes = likesOf.get(project.slug) ?? 0;
    const count = likes >= 25 ? 2 : likes >= 8 ? 1 : 0;
    const texts = shuffle(ANNOUNCEMENTS).slice(0, count);
    const end = project.endAt ?? NOW - HOUR;
    texts.forEach((text, index) => {
      const at = project.publishAt + between(5, 25) * DAY * (index + 1);
      if (at >= end) return;
      events.push({
        t: at,
        kind: 'announce',
        project,
        title: text.title,
        body: text.body.replace('{title}', project.title),
        pinned: index === count - 1,
      });
    });
  }

  events.sort((a, b) => a.t - b.t);
  return { people, projects, events };
}

/** Sur demande, le porteur tranche (le plus souvent oui) sous deux jours. */
function decision(project, at, end) {
  if ((project.participation ?? 'open') !== 'on_request') return {};
  const decideAt = at + between(3, 48) * HOUR;
  if (decideAt >= Math.min(end, NOW)) return {}; // encore en attente
  return { decideAt, accept: rand() < 0.85 };
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

async function call(method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  for (let attempt = 0; ; attempt++) {
    const response = await fetch(API + path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    // Le seed enchaine des centaines d'appels depuis une meme IP : on respecte
    // la limitation de debit plutot que de la desactiver.
    if (response.status === 429 && attempt < 8) {
      const retryAfter = Number(response.headers.get('retry-after'));
      await sleep((Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 5) * 1000);
      continue;
    }

    const text = await response.text();
    const payload = text ? JSON.parse(text) : undefined;
    if (!response.ok) {
      const error = new Error(`${method} ${path} -> ${response.status} ${JSON.stringify(payload)}`);
      error.status = response.status;
      throw error;
    }
    return payload;
  }
}

/** Ré-inscrire une personne deja presente echoue : on retombe sur la connexion. */
async function ensureAccount(person) {
  try {
    const session = await call('POST', '/auth/register', {
      body: {
        email: person.email,
        password: PASSWORD,
        username: person.username,
        displayName: person.displayName,
      },
    });
    return { session, created: true };
  } catch {
    const session = await call('POST', '/auth/login', {
      body: { email: person.email, password: PASSWORD },
    });
    return { session, created: false };
  }
}

// ---------------------------------------------------------------------------
// Base de donnees (facultative)
// ---------------------------------------------------------------------------

async function connectDb() {
  try {
    const { default: pg } = await import('pg');
    const client = new pg.Client({
      host: process.env.DB_HOST ?? 'localhost',
      port: Number(process.env.DB_PORT ?? 5432),
      user: process.env.DB_USERNAME ?? 'highfive',
      password: process.env.DB_PASSWORD ?? 'secret',
      database: process.env.DB_DATABASE ?? 'highfive_dev',
    });
    await client.connect();
    // RLS du service IA : la table `embeddings` filtre sur ce reglage.
    await client.query("SELECT set_config('app.current_tenant_id', $1, false)", [TENANT_ID]);
    return client;
  } catch (error) {
    console.warn(`  ! base injoignable (${error.message}) : historique et IA non dates`);
    return undefined;
  }
}

async function hasEmbeddingsTable(db) {
  const { rows } = await db.query("SELECT to_regclass('public.embeddings') AS t");
  return rows[0].t !== null;
}

/** Attend qu'une condition SQL soit remplie, en affichant la progression. */
async function waitFor(label, check, timeoutMs) {
  const started = Date.now();
  let last = '';
  let firstProgressAt;
  while (Date.now() - started < timeoutMs) {
    const { done, progress, value } = await check();
    if (progress !== last) {
      console.log(`  ${label} : ${progress}`);
      last = progress;
    }
    if (done) return true;
    if (value > 0) firstProgressAt ??= Date.now();
    // Rien du tout au bout d'une minute : le worker ne tourne pas, ou n'a
    // pas de cle OpenAI. Inutile d'attendre la suite.
    if (!firstProgressAt && Date.now() - started > 60_000) break;
    await sleep(3000);
  }
  console.warn(`  ! ${label} : abandon de l'attente (worker IA arrete ou sans cle OpenAI ?)`);
  return false;
}

// ---------------------------------------------------------------------------
// Deroulement
// ---------------------------------------------------------------------------

const world = buildWorld();

{
  const counts = {};
  for (const event of world.events) counts[event.kind] = (counts[event.kind] ?? 0) + 1;
  const likes = new Map();
  for (const event of world.events.filter((e) => e.kind === 'highfive')) {
    likes.set(event.project.slug, (likes.get(event.project.slug) ?? 0) + 1);
  }
  const recent = new Map();
  for (const event of world.events.filter((e) => e.kind === 'highfive' && e.t > NOW - 3 * DAY)) {
    recent.set(event.project.slug, (recent.get(event.project.slug) ?? 0) + 1);
  }
  const top = (map) => [...map].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([s, n]) => `${s} (${n})`).join(', ');
  console.log(`Monde simule : ${world.people.length} personnes, ${world.projects.length} projets`);
  console.log(`  evenements : ${JSON.stringify(counts)}`);
  console.log(`  plus soutenus : ${top(likes)}`);
  console.log(`  tendance (72 h) : ${top(recent)}`);
  if (DRY_RUN) process.exit(0);
}

console.log(`\nSeed sur ${API}`);

const sessions = new Map();
const userIds = new Map();
const freshUsers = new Set();

for (const person of world.people) {
  const { session, created } = await ensureAccount(person);
  sessions.set(person.username, session.token);
  userIds.set(person.username, session.user.id);
  if (created) {
    freshUsers.add(person.username);
    await call('PATCH', '/me', {
      token: session.token,
      body: { bio: person.bio, interests: person.interests },
    });
  }
}
console.log(`  ${world.people.length} personnes (${freshUsers.size} nouvelles)`);

const projectIds = new Map();
const freshProjects = new Set();

for (const project of world.projects) {
  const token = sessions.get(project.owner);
  try {
    const existing = await call('GET', `/projects/${project.slug}`, { token });
    projectIds.set(project.slug, existing.id);
    continue;
  } catch (err) {
    if (err.status !== 404) throw err;
  }
  const created = await call('POST', '/projects', {
    token,
    body: {
      title: project.title,
      tagline: project.tagline,
      description: project.description,
      tags: project.tags,
      needs: project.needs ?? [],
      visibility: project.private ? 'private' : 'public',
      participation: project.private ? 'on_invite' : (project.participation ?? 'open'),
    },
  });
  if (created.slug !== project.slug) {
    throw new Error(`Slug inattendu pour « ${project.title} » : ${created.slug}`);
  }
  projectIds.set(project.slug, created.id);
  freshProjects.add(project.slug);
}
console.log(`  ${world.projects.length} projets (${freshProjects.size} nouveaux)`);

const db = await connectDb();
const withAi = db && AI_WAIT_MS > 0 && (await hasEmbeddingsTable(db));
if (db && !withAi) console.log('  table embeddings absente ou attente desactivee : pas de synchro IA');

// 3. Vecteurs d'identite : un highfive sur un projet encore sans vecteur
//    serait perdu pour le vecteur d'interet de la personne.
if (withAi && (freshProjects.size > 0 || freshUsers.size > 0)) {
  const expectedProjects = world.projects
    .filter((p) => freshProjects.has(p.slug) && !p.private)
    .map((p) => projectIds.get(p.slug));
  const expectedUsers = [...freshUsers].map((username) => userIds.get(username));
  const ids = [...expectedProjects, ...expectedUsers];
  await waitFor(
    'vecteurs d identite',
    async () => {
      const { rows } = await db.query(
        `SELECT count(*)::int AS n FROM embeddings
          WHERE tenant_id = $1 AND vector_purpose = 'IDENTITY' AND entity_id = ANY($2::uuid[])`,
        [TENANT_ID, ids],
      );
      return { done: rows[0].n >= ids.length, progress: `${rows[0].n}/${ids.length}`, value: rows[0].n };
    },
    AI_WAIT_MS,
  );
}

// 4. L'histoire, dans l'ordre. Chaque appel note sa fenetre d'execution reelle
//    pour retrouver ensuite les notifications qu'il a produites.
const windows = [];
const highfiveTimes = [];
const joinTimes = [];
const commentTimes = [];
const announceTimes = [];
const failures = new Map();
const lastActivity = new Map();

for (const event of world.events) {
  if (!freshProjects.has(event.project.slug)) continue;
  const slug = event.project.slug;
  const token = sessions.get(event.user ?? event.project.owner);
  const startedAt = new Date();
  try {
    switch (event.kind) {
      case 'publish':
        await call('POST', `/projects/${slug}/transition`, { token, body: { transition: 'publish' } });
        break;
      case 'complete':
      case 'archive':
        await call('POST', `/projects/${slug}/transition`, { token, body: { transition: event.kind } });
        break;
      case 'highfive':
        await call('POST', `/projects/${slug}/highfive`, { token });
        highfiveTimes.push([projectIds.get(slug), userIds.get(event.user), event.t]);
        break;
      case 'join': {
        const request = await call('POST', `/projects/${slug}/join-requests`, {
          token,
          body: { message: 'Je veux bien donner un coup de main.' },
        });
        let decidedAt = request.status === 'accepted' ? event.t : undefined;
        if (request.status === 'pending' && event.decideAt) {
          await call('POST', `/projects/${slug}/join-requests/${request.id}/${event.accept ? 'accept' : 'reject'}`, {
            token: sessions.get(event.project.owner),
          });
          decidedAt = event.decideAt;
        }
        joinTimes.push([projectIds.get(slug), userIds.get(event.user), event.t, decidedAt ?? null]);
        break;
      }
      case 'comment':
      case 'reply': {
        if (event.kind === 'reply' && !event.parent.id) break;
        const comment = await call('POST', `/projects/${slug}/comments`, {
          token,
          body: { body: event.body, ...(event.kind === 'reply' ? { parentId: event.parent.id } : {}) },
        });
        event.id = comment.id;
        commentTimes.push([comment.id, event.t]);
        break;
      }
      case 'announce': {
        const announcement = await call('POST', `/projects/${slug}/announcements`, {
          token,
          body: { title: event.title, body: event.body, pinned: event.pinned },
        });
        announceTimes.push([announcement.id, event.t]);
        break;
      }
    }
    if (event.kind !== 'highfive') {
      lastActivity.set(slug, Math.max(lastActivity.get(slug) ?? 0, event.t));
    }
    windows.push([startedAt, new Date(), event.t]);
  } catch (error) {
    const key = `${event.kind} ${String(error.status ?? error.message).slice(0, 40)}`;
    failures.set(key, (failures.get(key) ?? 0) + 1);
  }
}
console.log(`  historique : ${highfiveTimes.length} highfives, ${joinTimes.length} candidatures, ${commentTimes.length} commentaires, ${announceTimes.length} annonces`);
for (const [key, n] of failures) console.log(`  ! ${n} x ${key}`);

// 5. Dates. On attend d'abord que les files IA soient videes : le job
//    `project_stats_updated` remet `updated_at` a maintenant.
if (db && freshProjects.size > 0) {
  const freshIds = [...freshProjects].map((slug) => projectIds.get(slug));

  if (withAi) {
    await waitFor(
      'compteurs IA',
      async () => {
        const { rows } = await db.query(
          `SELECT count(*)::int AS total,
                  count(*) FILTER (WHERE coalesce((e.payload_metadata->>'likes')::int, 0) = p.highfive_count)::int AS ok
             FROM projects p JOIN embeddings e
               ON e.entity_id = p.id AND e.vector_purpose = 'IDENTITY' AND e.tenant_id = $1
            WHERE p.id = ANY($2::uuid[])`,
          [TENANT_ID, freshIds],
        );
        return { done: rows[0].ok >= rows[0].total, progress: `${rows[0].ok}/${rows[0].total}`, value: rows[0].ok };
      },
      Math.max(AI_WAIT_MS / 2, 30_000),
    );
    // Les vecteurs d'interet passent par la meme file, juste avant : une
    // derniere marge pour les retardataires.
    await sleep(3000);
  }

  const ts = (ms) => new Date(ms).toISOString();
  const people = world.people.filter((person) => freshUsers.has(person.username));
  const projects = world.projects.filter((project) => freshProjects.has(project.slug));

  await db.query('BEGIN');
  await db.query(
    `UPDATE users u SET created_at = r.t,
            last_visit_at = CASE WHEN r.seen IS NULL THEN u.last_visit_at ELSE r.seen END
       FROM unnest($1::uuid[], $2::timestamptz[], $3::timestamptz[]) AS r(id, t, seen)
      WHERE u.id = r.id`,
    [
      people.map((p) => userIds.get(p.username)),
      people.map((p) => ts(p.signupAt)),
      people.map(() => (rand() < 0.7 ? ts(NOW - rand() * 4 * DAY) : null)),
    ],
  );
  await db.query(
    `UPDATE projects p SET created_at = r.created, updated_at = r.activity, last_activity_at = r.activity
       FROM unnest($1::uuid[], $2::timestamptz[], $3::timestamptz[]) AS r(id, created, activity)
      WHERE p.id = r.id`,
    [
      projects.map((p) => projectIds.get(p.slug)),
      projects.map((p) => ts(p.createdAt)),
      projects.map((p) => ts(Math.max(lastActivity.get(p.slug) ?? 0, p.publishAt ?? p.createdAt))),
    ],
  );
  await db.query(
    `UPDATE memberships m SET joined_at = r.t
       FROM unnest($1::uuid[], $2::uuid[], $3::timestamptz[]) AS r(project, member, t)
      WHERE m.project_id = r.project AND m.user_id = r.member`,
    [
      [...projects.map((p) => projectIds.get(p.slug)), ...joinTimes.filter((j) => j[3]).map((j) => j[0])],
      [...projects.map((p) => userIds.get(p.owner)), ...joinTimes.filter((j) => j[3]).map((j) => j[1])],
      [...projects.map((p) => ts(p.createdAt)), ...joinTimes.filter((j) => j[3]).map((j) => ts(j[3]))],
    ],
  );
  await db.query(
    `UPDATE highfives h SET given_at = r.t
       FROM unnest($1::uuid[], $2::uuid[], $3::timestamptz[]) AS r(project, giver, t)
      WHERE h.project_id = r.project AND h.user_id = r.giver`,
    [highfiveTimes.map((h) => h[0]), highfiveTimes.map((h) => h[1]), highfiveTimes.map((h) => ts(h[2]))],
  );
  await db.query(
    `UPDATE join_requests j SET created_at = r.t, decided_at = CASE WHEN j.decided_at IS NULL THEN NULL ELSE r.decided END
       FROM unnest($1::uuid[], $2::uuid[], $3::timestamptz[], $4::timestamptz[]) AS r(project, requester, t, decided)
      WHERE j.project_id = r.project AND j.user_id = r.requester`,
    [joinTimes.map((j) => j[0]), joinTimes.map((j) => j[1]), joinTimes.map((j) => ts(j[2])), joinTimes.map((j) => (j[3] ? ts(j[3]) : null))],
  );
  await db.query(
    `UPDATE comments c SET published_at = r.t FROM unnest($1::uuid[], $2::timestamptz[]) AS r(id, t) WHERE c.id = r.id`,
    [commentTimes.map((c) => c[0]), commentTimes.map((c) => ts(c[1]))],
  );
  await db.query(
    `UPDATE announcements a SET published_at = r.t FROM unnest($1::uuid[], $2::timestamptz[]) AS r(id, t) WHERE a.id = r.id`,
    [announceTimes.map((a) => a[0]), announceTimes.map((a) => ts(a[1]))],
  );
  // Notifications : celles produites pendant un appel prennent la date simulee
  // de cet appel ; les plus anciennes ont evidemment deja ete lues.
  await db.query(
    `UPDATE notifications n SET created_at = r.sim, read = n.read OR r.sim < now() - interval '2 days'
       FROM unnest($1::timestamptz[], $2::timestamptz[], $3::timestamptz[]) AS r(a, b, sim)
      WHERE n.created_at BETWEEN r.a AND r.b`,
    [windows.map((w) => w[0].toISOString()), windows.map((w) => w[1].toISOString()), windows.map((w) => ts(w[2]))],
  );

  if (withAi) {
    // Trending IA : score = (likes + 1) / (age_h + 2)^1.5, l'age etant lu sur
    // `updated_at`. On y met la date du dernier highfive (ou de creation), et
    // on recale `likes` sur le compteur du core au cas ou un job se serait perdu.
    await db.query(
      `UPDATE embeddings e
          SET updated_at = coalesce((SELECT max(h.given_at) FROM highfives h WHERE h.project_id = p.id), p.created_at),
              payload_metadata = coalesce(e.payload_metadata, '{}'::jsonb) || jsonb_build_object('likes', p.highfive_count)
         FROM projects p
        WHERE e.entity_id = p.id AND e.tenant_id = $1 AND e.entity_type = 'PROJECT'
          AND e.vector_purpose = 'IDENTITY' AND p.id = ANY($2::uuid[])`,
      [TENANT_ID, freshIds],
    );
  }
  await db.query('COMMIT');
  console.log('  dates reecrites (core' + (withAi ? ' + embeddings' : '') + ')');
}

if (withAi) {
  const { rows } = await db.query(
    `SELECT entity_type::text AS type, vector_purpose::text AS purpose, count(*)::int AS n
       FROM embeddings WHERE tenant_id = $1 GROUP BY 1, 2 ORDER BY 1, 2`,
    [TENANT_ID],
  );
  console.log(`  embeddings : ${rows.map((r) => `${r.type}/${r.purpose} ${r.n}`).join(', ') || 'aucun'}`);
}
await db?.end();

// ---------------------------------------------------------------------------
// Messagerie : alignee sur src/mocks/data/conversations.ts du front, avec les
// personnes de ce jeu. Chaque conversation n'est ecrite que si elle manque :
// une conversation directe se reprend (R-MSG1), et relancer le seed ajouterait
// sinon les memes messages a chaque demarrage.
// ---------------------------------------------------------------------------

const DIRECTS = [
  { from: 'sophie.b', to: 'alex.rivera', message: 'On se voit samedi pour la fresque ?', reply: 'Oui, a samedi 9 h alors.' },
  { from: 'marc.leroy', to: 'alex.rivera', message: 'Tu as les dimensions du mur ?', reply: 'Trente metres sur quatre, a peu pres.' },
  // R-MSG7 : sans reponse, elle reste dans les « demandes de message » d'alex.
  { from: 'yanis.f', to: 'alex.rivera', message: "Salut, je peux filer un coup de main sur la fresque, tu geres l'equipe ?" },
];

const conversationsOf = (username) =>
  call('GET', '/conversations', { token: sessions.get(username) });

for (const direct of DIRECTS) {
  const otherId = userIds.get(direct.to);
  const existing = (await conversationsOf(direct.from)).find(
    (c) => c.type === 'direct' && c.participantIds.includes(otherId),
  );
  if (existing) continue;
  const created = await call('POST', '/conversations', {
    token: sessions.get(direct.from),
    body: { participantIds: [otherId], message: direct.message },
  });
  if (direct.reply) {
    await call('POST', `/conversations/${created.id}/messages`, {
      token: sessions.get(direct.to),
      body: { body: direct.reply },
    });
  }
  console.log(`  conversation ${direct.from} -> ${direct.to}`);
}

const GROUP = {
  creator: 'lea.m',
  title: 'Chorale du mardi',
  members: ['alex.rivera', 'sophie.b'],
  message: 'On decale a 19 h 30 cette semaine.',
};
if (!(await conversationsOf(GROUP.creator)).some((c) => c.type === 'group' && c.title === GROUP.title)) {
  await call('POST', '/conversations', {
    token: sessions.get(GROUP.creator),
    body: {
      participantIds: GROUP.members.map((username) => userIds.get(username)),
      title: GROUP.title,
      message: GROUP.message,
    },
  });
  console.log(`  groupe ${GROUP.title}`);
}

// R-MSG3 : le canal de la fresque existe deja (son equipe vient d'etre
// formee) ; on y depose un premier message s'il est encore vide.
const fresqueSlug = slugify(PROJECTS[0].title);
const canal = (await conversationsOf('marc.leroy')).find(
  (c) => c.type === 'channel' && c.projectSlug === fresqueSlug,
);
if (!canal) {
  console.log(`  canal ${fresqueSlug} introuvable (equipe incomplete ?)`);
} else if (!canal.lastMessage) {
  await call('POST', `/conversations/${canal.id}/messages`, {
    token: sessions.get('marc.leroy'),
    body: { body: 'La peinture est commandee, livraison jeudi.' },
  });
  console.log(`  canal ${fresqueSlug}`);
}

// ---------------------------------------------------------------------------
// Personnalisation : alignee sur src/mocks/data/customizationFixtures.ts du
// front (memes palettes, memes textes). Images = degrades, pas de fausses
// photos (PRODUCT.md du front). Une fiche deja personnalisee n'est pas
// retouchee : le porteur a pu la modifier depuis.
// ---------------------------------------------------------------------------

/** PNG d'un degrade diagonal, sans dependance (`zlib` suffit). */
function gradientPng(from, to, width, height) {
  const chunk = (type, data) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // 8 bits par canal
  header[9] = 2; // RVB
  const rows = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const offset = y * (width * 3 + 1);
    rows[offset] = 0; // pas de filtre
    for (let x = 0; x < width; x++) {
      const t = (x / width + y / height) / 2;
      for (let c = 0; c < 3; c++) {
        rows[offset + 1 + x * 3 + c] = Math.round(from[c] + (to[c] - from[c]) * t);
      }
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

async function uploadImage(slug, token, png) {
  const form = new FormData();
  form.append('file', new Blob([png], { type: 'image/png' }), 'degrade.png');
  const response = await fetch(`${API}/projects/${slug}/customization/images`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`POST /projects/${slug}/customization/images -> ${response.status} ${JSON.stringify(payload)}`);
  }
  return payload;
}

const section = (order, hidden = []) =>
  order.map((id) => ({ id, visible: !hidden.includes(id) }));

const CUSTOMIZATIONS = [
  {
    // Banniere, galerie et palette Bonbon, ordre par defaut.
    owner: 'alex.rivera',
    slug: fresqueSlug,
    banner: { from: [255, 77, 140], to: [255, 208, 226], alt: 'Degrade rose evoquant les couleurs de la fresque', focal: { x: 50, y: 50 } },
    theme: { background: '#fff0f5', panel: '#ffffff', text: '#3a1d2b', accent: '#d6246e' },
    sections: section(['pinned', 'needs', 'about', 'gallery', 'comments']),
    gallery: [
      { from: [255, 208, 226], to: [204, 0, 85], alt: 'Aplat de rose et de rouge, premier jet du mur', caption: 'Premier jet de la palette' },
      { from: [255, 107, 26], to: [255, 214, 0], alt: "Degrade orange, ambiance de l'atelier du samedi", caption: 'Atelier du samedi' },
    ],
  },
  {
    // Sans banniere : palette Foret, A propos en premier.
    owner: 'sophie.b',
    slug: slugify(PROJECTS[1].title),
    theme: { background: '#eaf1e8', panel: '#fafdf9', text: '#1d2b20', accent: '#2f7d4f' },
    sections: section(['about', 'pinned', 'needs', 'gallery', 'comments']),
    gallery: [
      { from: [94, 214, 81], to: [237, 252, 232], alt: 'Degrade vert evoquant les bacs du jardin' },
    ],
  },
];

for (const custom of CUSTOMIZATIONS) {
  const token = sessions.get(custom.owner);
  const project = await call('GET', `/projects/${custom.slug}`, { token });
  if (project.customization) continue;
  const banner = custom.banner
    ? await uploadImage(custom.slug, token, gradientPng(custom.banner.from, custom.banner.to, 1600, 533))
    : undefined;
  const gallery = [];
  for (const item of custom.gallery) {
    const image = await uploadImage(custom.slug, token, gradientPng(item.from, item.to, 1200, 800));
    gallery.push({ id: image.id, url: image.url, alt: item.alt, ...(item.caption ? { caption: item.caption } : {}) });
  }
  await call('PATCH', `/projects/${custom.slug}/customization`, {
    token,
    body: {
      ...(banner ? { banner: { id: banner.id, url: banner.url, alt: custom.banner.alt, focal: custom.banner.focal } } : {}),
      theme: custom.theme,
      sections: custom.sections,
      gallery,
    },
  });
  console.log(`  personnalisation ${custom.slug}`);
}

console.log('\nTermine.');
console.log(`Compte de demonstration : alex.rivera@example.com / ${PASSWORD}`);
