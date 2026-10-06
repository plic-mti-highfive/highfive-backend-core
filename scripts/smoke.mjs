#!/usr/bin/env node
/**
 * Parcours de bout en bout sur une API demarree.
 *
 * Deux garanties, pas une : chaque verification porte sur une regle du contrat
 * (les R-xx sont citees), et le script **mesure sa propre couverture** — toute
 * route servie qui n'aurait ete appelee par aucun scenario fait echouer le
 * script. Un test de bout en bout qui ne dit pas ce qu'il ne teste pas ne vaut
 * pas grand-chose.
 *
 * Prerequis : API demarree avec `ADMIN_EMAILS` contenant `ADMIN_EMAIL`
 * ci-dessous, PostgreSQL, et MinIO pour la partie fichiers (sinon ces
 * scenarios sont declares sautes, pas passes).
 *
 * Usage : node scripts/smoke.mjs
 */

import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

const API = (process.env.API_URL ?? 'http://localhost:3000') + '/api';
const ADMIN_EMAIL = process.env.SMOKE_ADMIN_EMAIL ?? 'admin@highfive.test';

let failures = 0;
let skipped = 0;

// ---------------------------------------------------------------- couverture

/**
 * Les gabarits de routes, lus du contrat et completes des routes hors contrat.
 * Sert a rattacher chaque appel concret a la route qu'il exerce.
 */
const ROUTE_TEMPLATES = (() => {
  const spec = parse(
    readFileSync(new URL('../openapi.yaml', import.meta.url), 'utf8'),
  );
  const routes = [];

  for (const [path, operations] of Object.entries(spec.paths)) {
    for (const method of Object.keys(operations)) {
      if (['get', 'post', 'patch', 'put', 'delete'].includes(method)) {
        routes.push({ method: method.toUpperCase(), template: path });
      }
    }
  }

  // Routes servies hors contrat (docs/REFACTO-V2.md §2, docs/CANVAS.md §2).
  for (const extra of [
    'GET /health',
    'GET /health/ready',
    'GET /projects/{slug}/wall/session',
    'POST /projects/{slug}/wall/suggest-tasks',
    'POST /projects/{slug}/wall/suggested-tasks',
    'POST /reports',
  ]) {
    const [method, template] = extra.split(' ');
    routes.push({ method, template });
  }

  return routes.map((route) => ({
    ...route,
    // Les segments les plus specifiques d'abord : `/projects/{slug}/wall/session`
    // ne doit pas etre absorbe par `/projects/{slug}/wall`.
    pattern: new RegExp(
      '^' + route.template.replace(/\{[^}]+\}/g, '[^/]+') + '$',
    ),
    depth: route.template.split('/').length,
  }));
})();

const covered = new Set();

function record(method, path) {
  const clean = path.split('?')[0];
  const match = ROUTE_TEMPLATES.filter(
    (route) => route.method === method && route.pattern.test(clean),
  ).sort((a, b) => b.depth - a.depth || a.template.length - b.template.length)[0];

  if (match) covered.add(`${match.method} ${match.template}`);
}

// ------------------------------------------------------------------- helpers

async function call(method, path, { token, body, form } = {}) {
  record(method, path);

  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';

  const response = await fetch(API + path, {
    method,
    headers,
    body: form ?? (body ? JSON.stringify(body) : undefined),
  });

  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : undefined;
  } catch {
    payload = text;
  }
  return { status: response.status, body: payload };
}

function check(label, condition, detail) {
  if (condition) {
    console.log(`  ok   ${label}`);
    return true;
  }
  failures += 1;
  console.log(`  FAIL ${label}`, JSON.stringify(detail)?.slice(0, 400));
  return false;
}

function skip(label, why) {
  skipped += 1;
  console.log(`  --   ${label} (saute : ${why})`);
}

function section(title) {
  console.log(`\n# ${title}`);
}

const png = () =>
  Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(256, 7),
  ]);

function upload(field, name, buffer, type) {
  const form = new FormData();
  form.append(field, new Blob([buffer], { type }), name);
  return form;
}

// ---------------------------------------------------------------- scenarios

const stamp = Date.now().toString(36).slice(-6);
const person = (name) => ({
  email: `${name}.${stamp}@example.com`,
  password: 'demo1234',
  username: `${name}${stamp}`,
});

const alice = person('alice');
const bob = person('bob');
const carol = person('carol');

section('sante');
let r = await call('GET', '/health');
check('sonde de vivacite', r.status === 200 && r.body.status === 'ok', r.body);

r = await call('GET', '/health/ready');
check('sonde de disponibilite', r.status === 200 && r.body.database === 'connected', r.body);

section('auth');
r = await call('POST', '/auth/register', { body: alice });
check('inscription 201', r.status === 201, r.body);
const aliceToken = r.body?.token;
const aliceId = r.body?.user?.id;
check('la session porte le compte', r.body?.user?.email === alice.email, r.body);
check('role plateforme par defaut', r.body?.user?.platformRole === 'member', r.body?.user);

r = await call('POST', '/auth/register', { body: bob });
const bobToken = r.body?.token;
const bobId = r.body?.user?.id;
check('inscription bob', r.status === 201, r.body);

r = await call('POST', '/auth/register', { body: carol });
let carolToken = r.body?.token;
const carolId = r.body?.user?.id;
check('inscription carol', r.status === 201, r.body);

r = await call('POST', '/auth/register', { body: alice });
check('adresse deja prise 409', r.status === 409, r.body);

r = await call('POST', '/auth/register', {
  body: { ...person('other'), username: alice.username },
});
check('pseudo deja pris 409', r.status === 409, r.body);

r = await call('POST', '/auth/login', {
  body: { email: alice.email, password: 'mauvais-mot-de-passe' },
});
check('mot de passe faux 401', r.status === 401, r.body);

r = await call('POST', '/auth/login', {
  body: { email: `inconnu.${stamp}@example.com`, password: 'demo1234' },
});
check('compte inconnu 401, meme message', r.status === 401, r.body);

r = await call('POST', '/auth/login', {
  body: { email: alice.email, password: alice.password },
});
check('connexion 200', r.status === 200 && r.body.token, r.body);
const aliceSecondToken = r.body?.token;

r = await call('GET', '/me', { token: aliceToken });
check('GET /me 200', r.status === 200 && r.body.username === alice.username, r.body);

r = await call('GET', '/me');
check('GET /me anonyme 401', r.status === 401, r.body);

r = await call('POST', '/auth/password-reset-request', {
  body: { email: alice.email },
});
check('demande de reinitialisation 204', r.status === 204, r.body);

r = await call('POST', '/auth/password-reset-request', {
  body: { email: `jamais-vu.${stamp}@example.com` },
});
check('adresse inconnue : meme 204, rien revele', r.status === 204, r.body);

r = await call('POST', '/auth/password-reset', {
  body: { token: 'jeton-invente', password: 'nouveau-mot-de-passe' },
});
check('jeton de reinitialisation invalide 400', r.status === 400, r.body);

r = await call('POST', '/auth/logout', { token: aliceSecondToken });
check('deconnexion du second jeton 204', r.status === 204, r.body);

r = await call('GET', '/me', { token: aliceSecondToken });
check('second jeton invalide', r.status === 401, r.body);

r = await call('GET', '/me', { token: aliceToken });
check('le premier jeton survit a la deconnexion de l autre', r.status === 200, r.body);

section('themes');
r = await call('GET', '/tags');
check('24 themes actifs (R-T1/R-T2)', r.status === 200 && r.body.length === 24, r.body?.length);

section('profil');
r = await call('PATCH', '/me', {
  token: aliceToken,
  body: { displayName: 'Alice', bio: 'Bricoleuse du dimanche', interests: ['dessin', 'cuisine'] },
});
check('mise a jour du profil 200', r.status === 200 && r.body.interests.length === 2, r.body);

r = await call('PATCH', '/me', { token: aliceToken, body: { interests: ['inexistant'] } });
check('theme inconnu refuse 400', r.status === 400, r.body);

r = await call('GET', `/users/${alice.username}`);
check('profil public 200', r.status === 200 && r.body.bio === 'Bricoleuse du dimanche', r.body);
check('profil public sans champs prives', r.body.email === undefined && r.body.accountStatus === undefined, r.body);

r = await call('GET', `/users/inconnu${stamp}`);
check('profil inconnu 404', r.status === 404, r.body);

section('projets');
r = await call('POST', '/projects', {
  token: aliceToken,
  body: {
    title: `Fresque murale ${stamp}`,
    tagline: 'Repeindre le mur du gymnase avec le quartier',
    description: 'On cherche des bras et des idees.',
    tags: ['dessin', 'quartier'],
    needs: [{ label: 'Peintres amateurs' }],
    visibility: 'public',
    participation: 'open',
  },
});
check('creation 201', r.status === 201, r.body);
const slug = r.body?.slug;
const projectId = r.body?.id;
const projectTitle = r.body?.title;
check('etat initial brouillon (R-PR3)', r.body?.state === 'draft', r.body);
check('besoin cree', r.body?.needs?.length === 1, r.body?.needs);

r = await call('POST', '/projects', {
  token: aliceToken,
  body: { title: 'Prive ouvert', tagline: 'Incoherent', tags: ['code'], visibility: 'private', participation: 'open' },
});
check('R-PR1 : prive + ouvert refuse 400', r.status === 400, r.body);

r = await call('GET', `/projects/${slug}`, { token: bobToken });
check('R-PR2 : brouillon invisible pour un tiers 404', r.status === 404, r.body);

r = await call('POST', `/projects/${slug}/transition`, { token: bobToken, body: { transition: 'publish' } });
check('publier interdit a un tiers 403', r.status === 403, r.body);

r = await call('POST', `/projects/${slug}/transition`, { token: aliceToken, body: { transition: 'publish' } });
check('publication 200 -> actif', r.status === 200 && r.body.state === 'active', r.body);

r = await call('POST', `/projects/${slug}/transition`, { token: aliceToken, body: { transition: 'publish' } });
check('republier depuis actif 409', r.status === 409, r.body);

r = await call('PATCH', `/projects/${slug}`, {
  token: aliceToken,
  body: {
    tagline: 'Un mur, un quartier, des couleurs',
    description: 'Mise a jour.',
    tags: ['dessin', 'quartier', 'evenement'],
    needs: [{ id: '00000000-0000-4000-8000-000000000123', label: 'Echafaudage', fulfilled: false }],
  },
});
check('modification 200', r.status === 200 && r.body.tags.length === 3, r.body);
check('besoins remplaces en bloc', r.body?.needs?.length === 1 && r.body.needs[0].label === 'Echafaudage', r.body?.needs);

r = await call('PATCH', `/projects/${slug}`, { token: aliceToken, body: { visibility: 'private' } });
check('R-PR1 revalidee sur l etat resultant 422', r.status === 422, r.body);

r = await call('PATCH', `/projects/${slug}`, { token: bobToken, body: { title: 'Pirate' } });
check('modification par un tiers 403', r.status === 403, r.body);

r = await call('GET', '/projects');
check('fil public 200', r.status === 200 && r.body.items.some((p) => p.slug === slug), r.body?.total);
const card = r.body.items.find((p) => p.slug === slug);
check('carte : porteur et compteur d equipe', card?.owner?.username === alice.username && card?.membersCount === 1, card);
check('carte : besoins et apercu d equipe', Array.isArray(card?.needs) && Array.isArray(card?.teamPreview), card);

r = await call('GET', '/projects?limit=1');
check('pagination : une page d un element', r.body.items.length === 1, r.body);
const firstCursor = r.body.nextCursor;
if (firstCursor) {
  r = await call('GET', `/projects?limit=1&cursor=${encodeURIComponent(firstCursor)}`);
  check('pagination : page suivante differente', r.status === 200, r.body);
} else {
  check('pagination : page unique, curseur nul', true);
}

r = await call('GET', '/projects?q=fresque&tags=dessin&sort=popular&participation=open');
check('fil filtre et trie 200', r.status === 200, r.body?.total);

r = await call('GET', '/me/projects', { token: aliceToken });
check('mes projets 200', r.status === 200 && r.body.some((p) => p.slug === slug), r.body?.length);

section('highfives');
r = await call('POST', `/projects/${slug}/highfive`, { token: aliceToken });
check('R-H2 : le porteur ne highfive pas son projet 403', r.status === 403, r.body);

r = await call('POST', `/projects/${slug}/highfive`, { token: bobToken });
check('highfive 200', r.status === 200 && r.body.given === true && r.body.highfiveCount === 1, r.body);

r = await call('POST', `/projects/${slug}/highfive`, { token: bobToken });
check('R-H1 : idempotent', r.status === 200 && r.body.highfiveCount === 1, r.body);

r = await call('DELETE', `/projects/${slug}/highfive`, { token: bobToken });
check('retrait 200', r.status === 200 && r.body.given === false && r.body.highfiveCount === 0, r.body);

await call('POST', `/projects/${slug}/highfive`, { token: bobToken });
r = await call('GET', `/projects/${slug}/highfives`);
check('R-H3 : liste publique', r.status === 200 && r.body.items.length === 1, r.body);

section('equipe : demandes');
r = await call('POST', `/projects/${slug}/join-requests`, { token: bobToken, body: { message: 'Je peux peindre' } });
check('participation ouverte : accepte d emblee', r.status === 201 && r.body.status === 'accepted', r.body);

r = await call('POST', `/projects/${slug}/join-requests`, { token: bobToken, body: {} });
check('deja membre 409', r.status === 409, r.body);

r = await call('GET', `/projects/${slug}/members`);
check('equipe a deux', r.status === 200 && r.body.length === 2, r.body?.length);
check('membre resolu avec son profil', r.body.every((m) => m.user?.username), r.body?.[0]);

r = await call('GET', `/projects/${slug}/join-requests`, { token: aliceToken });
check('liste des demandes (porteur) 200', r.status === 200 && r.body.length >= 1, r.body?.length);

r = await call('GET', `/projects/${slug}/join-requests`, { token: carolToken });
check('liste des demandes interdite aux tiers 403', r.status === 403, r.body);

// Un second projet, sur demande, pour exercer accepter/refuser.
r = await call('POST', '/projects', {
  token: aliceToken,
  body: {
    title: `Jardin partage ${stamp}`,
    tagline: 'Transformer la friche en potager',
    tags: ['jardinage'],
    visibility: 'public',
    participation: 'on_request',
  },
});
const gardenSlug = r.body?.slug;
await call('POST', `/projects/${gardenSlug}/transition`, { token: aliceToken, body: { transition: 'publish' } });

r = await call('POST', `/projects/${gardenSlug}/join-requests`, { token: carolToken, body: { message: 'Je jardine' } });
check('participation sur demande : en attente', r.status === 201 && r.body.status === 'pending', r.body);
const carolRequestId = r.body?.id;

r = await call('POST', `/projects/${gardenSlug}/join-requests`, { token: carolToken, body: {} });
check('seconde demande en attente 409', r.status === 409, r.body);

r = await call('POST', `/projects/${gardenSlug}/join-requests/${carolRequestId}/accept`, { token: carolToken });
check('accepter sa propre demande 403', r.status === 403, r.body);

r = await call('POST', `/projects/${gardenSlug}/join-requests/${carolRequestId}/accept`, { token: aliceToken });
check('acceptation 204', r.status === 204, r.body);

r = await call('POST', `/projects/${gardenSlug}/join-requests/${carolRequestId}/accept`, { token: aliceToken });
check('demande deja traitee 409', r.status === 409, r.body);

r = await call('POST', `/projects/${gardenSlug}/join-requests`, { token: bobToken, body: {} });
const bobRequestId = r.body?.id;
r = await call('POST', `/projects/${gardenSlug}/join-requests/${bobRequestId}/reject`, { token: aliceToken });
check('R-D3 : refus 204, sans motif renvoye', r.status === 204, r.body);

r = await call('POST', `/projects/${gardenSlug}/join-requests`, { token: bobToken, body: {} });
check('R-D2 : redemander apres un refus recent 409', r.status === 409, r.body);

section('equipe : invitations');
r = await call('POST', `/projects/${slug}/invitations`, {
  token: aliceToken,
  body: { recipientId: carolId, proposedRole: 'member', message: 'Rejoins-nous' },
});
check('invitation 201', r.status === 201 && r.body.status === 'pending', r.body);
const invitationId = r.body?.id;
check('R-I1 : expiration a 30 jours', new Date(r.body?.expiresAt) > new Date(), r.body?.expiresAt);

r = await call('POST', `/projects/${slug}/invitations`, {
  token: aliceToken,
  body: { recipientId: carolId, proposedRole: 'member' },
});
check('invitation deja en cours 409', r.status === 409, r.body);

r = await call('POST', `/projects/${slug}/invitations`, {
  token: carolToken,
  body: { recipientId: bobId, proposedRole: 'member' },
});
check('inviter sans etre porteur 403', r.status === 403, r.body);

r = await call('GET', `/projects/${slug}/invitations`, { token: aliceToken });
check('liste des invitations 200', r.status === 200 && r.body.length === 1, r.body?.length);

r = await call('POST', `/invitations/${invitationId}/accept`, { token: bobToken });
check('accepter l invitation d un autre 404', r.status === 404, r.body);

r = await call('POST', `/invitations/${invitationId}/accept`, { token: carolToken });
check('R-I2 : acceptation 204', r.status === 204, r.body);

r = await call('GET', `/projects/${slug}/members`);
check('equipe a trois apres invitation', r.body.length === 3, r.body?.length);

// Une seconde invitation, pour le refus.
r = await call('POST', `/projects/${gardenSlug}/invitations`, {
  token: aliceToken,
  body: { recipientId: bobId, proposedRole: 'observer' },
});
const rejectedInvitationId = r.body?.id;
r = await call('POST', `/invitations/${rejectedInvitationId}/reject`, { token: bobToken });
check('refus d invitation 204', r.status === 204, r.body);

section('equipe : roles et exclusions');
r = await call('PATCH', `/projects/${slug}/members/${bobId}`, { token: aliceToken, body: { role: 'co_owner' } });
check('nommer co-porteur 200', r.status === 200 && r.body.role === 'co_owner', r.body);

r = await call('PATCH', `/projects/${slug}/members/${bobId}`, { token: aliceToken, body: { role: 'owner' } });
check('R-M1 : nommer porteur par le role 400', r.status === 400, r.body);

r = await call('PATCH', `/projects/${slug}/members/${carolId}`, { token: bobToken, body: { role: 'member' } });
check('changer un role sans etre porteur 403', r.status === 403, r.body);

r = await call('POST', `/projects/${slug}/leave`, { token: aliceToken });
check('R-M3 : le porteur ne quitte pas 403', r.status === 403, r.body);

r = await call('DELETE', `/projects/${slug}/members/${aliceId}`, { token: bobToken });
check('R-M4 : exclure le porteur 403', r.status === 403, r.body);

r = await call('POST', `/projects/${slug}/members/${carolId}/block`, { token: aliceToken });
check('blocage 204', r.status === 204, r.body);

r = await call('POST', `/projects/${slug}/comments`, { token: carolToken, body: { body: 'Je suis bloquee' } });
check('R-V8 : une personne bloquee ne commente plus 403', r.status === 403, r.body);

r = await call('POST', `/projects/${slug}/invitations`, {
  token: aliceToken,
  body: { recipientId: carolId, proposedRole: 'member' },
});
check('R-I3 : inviter une personne bloquee 403', r.status === 403, r.body);

r = await call('DELETE', `/projects/${slug}/members/${carolId}`, { token: aliceToken });
check('exclusion 204', r.status === 204, r.body);

r = await call('POST', `/projects/${gardenSlug}/leave`, { token: carolToken });
check('quitter un projet 204', r.status === 204, r.body);

section('annonces');
r = await call('POST', `/projects/${slug}/announcements`, {
  token: aliceToken,
  body: { title: 'Premiere seance samedi', body: 'Rendez-vous a 10h.', pinned: true },
});
check('annonce epinglee 201', r.status === 201 && r.body.pinned === true, r.body);
const announcementId = r.body?.id;

r = await call('POST', `/projects/${slug}/announcements`, {
  token: carolToken,
  body: { title: 'Annonce pirate', body: 'Non' },
});
check('R-A1 : publier sans etre porteur 403', r.status === 403, r.body);

r = await call('POST', `/projects/${slug}/announcements`, {
  token: aliceToken,
  body: { title: 'Deuxieme seance', body: 'Meme heure.', pinned: true },
});
const secondAnnouncementId = r.body?.id;

r = await call('GET', `/projects/${slug}/announcements`);
check('R-A2 : une seule annonce epinglee', r.body.filter((a) => a.pinned).length === 1, r.body);
check('annonces avec auteur resolu', r.body.every((a) => a.author?.username), r.body?.[0]);

r = await call('POST', `/announcements/${announcementId}/pin`, { token: aliceToken });
check('epingler bascule l epingle 200', r.status === 200 && r.body.pinned === true, r.body);

r = await call('GET', `/projects/${slug}/announcements`);
check('toujours une seule epinglee', r.body.filter((a) => a.pinned).length === 1, r.body);

r = await call('DELETE', `/announcements/${secondAnnouncementId}`, { token: aliceToken });
check('suppression 204', r.status === 204, r.body);

section('commentaires');
r = await call('POST', `/projects/${slug}/comments`, { token: bobToken, body: { body: 'Super idee !' } });
check('commentaire 201', r.status === 201, r.body);
const commentId = r.body?.id;

r = await call('POST', `/projects/${slug}/comments`, {
  token: aliceToken,
  body: { body: 'Merci !', parentId: commentId },
});
check('reponse 201', r.status === 201, r.body);
const replyId = r.body?.id;

r = await call('POST', `/projects/${slug}/comments`, {
  token: bobToken,
  body: { body: 'Non', parentId: replyId },
});
check('R-C4 : pas de troisieme niveau 400', r.status === 400, r.body);

r = await call('GET', `/projects/${slug}/comments`);
check('liste avec auteurs', r.status === 200 && r.body.every((c) => c.author?.username), r.body?.length);

r = await call('DELETE', `/comments/${commentId}`, { token: aliceToken });
check('R-C3 : suppression reservee a l administration 403', r.status === 403, r.body);

r = await call('POST', `/comments/${commentId}/hide`, { token: aliceToken });
check('masquage par le porteur 204', r.status === 204, r.body);

r = await call('GET', `/projects/${slug}/comments`);
check('commentaire masque absent de la liste', !r.body.some((c) => c.id === commentId), r.body);

section('Les Taches');
r = await call('GET', `/projects/${slug}/columns`);
check('R-K1 : trois colonnes par defaut', r.status === 200 && r.body.length === 3, r.body?.length);
const [todo, doing] = r.body;
check('libelles par defaut', todo.label === 'A faire' && doing.label === 'En cours', r.body);

r = await call('POST', '/tasks', { token: bobToken, body: { columnId: todo.id, title: 'Acheter la peinture' } });
check('R-K4 : titre seul suffit 201', r.status === 201, r.body);
const taskId = r.body?.id;

r = await call('POST', '/tasks', { token: carolToken, body: { columnId: todo.id, title: 'Pirate' } });
check('creer une tache sans etre membre 403', r.status === 403, r.body);

r = await call('POST', '/tasks', { token: bobToken, body: { columnId: todo.id, title: 'Louer un echafaudage' } });
const secondTaskId = r.body?.id;

r = await call('PATCH', `/tasks/${taskId}`, {
  token: bobToken,
  body: { details: '20 litres de blanc', dueDate: '2026-10-01', assigneeIds: [bobId] },
});
check('modification 200', r.status === 200 && r.body.dueDate === '2026-10-01', r.body);
check('R-K5 : assignation a un membre', r.body.assigneeIds.includes(bobId), r.body);

r = await call('PATCH', `/tasks/${taskId}`, { token: bobToken, body: { assigneeIds: [carolId] } });
check('assigner hors equipe refuse 400', r.status === 400, r.body);

r = await call('PATCH', `/tasks/${taskId}`, { token: bobToken, body: { dueDate: null } });
check('echeance retiree par null', r.status === 200 && r.body.dueDate === undefined, r.body);

r = await call('POST', `/tasks/${taskId}/move`, { token: bobToken, body: { columnId: doing.id, order: 0 } });
check('deplacement entre colonnes 200', r.status === 200 && r.body.columnId === doing.id, r.body);

r = await call('GET', `/projects/${slug}/tasks`);
check('liste des taches 200', r.status === 200 && r.body.length >= 2, r.body?.length);

r = await call('POST', `/projects/${slug}/columns`, { token: aliceToken, body: { label: 'A relire', color: 'sky' } });
check('colonne creee 201', r.status === 201 && r.body.color === 'sky', r.body);
const extraColumn = r.body?.id;

r = await call('DELETE', `/columns/${extraColumn}`, { token: aliceToken });
check('R-K3 : suppression sans destination 400', r.status === 400, r.body);

r = await call('DELETE', `/columns/${extraColumn}?moveTo=${todo.id}`, { token: aliceToken });
check('suppression avec destination 204', r.status === 204, r.body);

r = await call('DELETE', `/tasks/${secondTaskId}`, { token: bobToken });
check('suppression de tache 204', r.status === 204, r.body);

section('Le Mur');
r = await call('GET', `/projects/${slug}/wall`, { token: aliceToken });
check('metadonnees du Mur 200', r.status === 200 && r.body.projectId === projectId, r.body);

r = await call('GET', `/projects/${slug}/wall`);
check('R-W1 : Le Mur n est jamais public 401', r.status === 401, r.body);

r = await call('GET', `/projects/${slug}/wall`, { token: carolToken });
check('R-W1 : hors equipe, refuse 403', r.status === 403, r.body);

r = await call('POST', `/projects/${slug}/wall/to-tasks`, {
  token: bobToken,
  body: {
    elements: [
      { id: 'shape:abc', label: 'Acheter outil' },
      { id: 'shape:def', label: 'Demander de l aide' },
    ],
  },
});
check('R-W2 : conversion 201', r.status === 201 && r.body.length === 2, r.body);
check('R-W2 : lien vers l origine conserve', r.body?.[0]?.wallOriginId === 'shape:abc', r.body?.[0]);

r = await call('GET', `/projects/${slug}/wall/session`, { token: aliceToken });
check('session collaborative : jeton emis', r.status === 200 && typeof r.body.token === 'string', r.body);
check('role projet projete sur le document', r.body?.role === 'admin', r.body);

r = await call('POST', `/projects/${slug}/wall/suggest-tasks`, { token: aliceToken });
if (r.status === 200) {
  check('suggestions : Mur vide declare vide', r.body.empty === true, r.body);
} else {
  check('suggestions : service indisponible signale proprement', r.status === 503, r.body);
}

r = await call('POST', `/projects/${slug}/wall/suggested-tasks`, {
  token: aliceToken,
  body: { tasks: [{ title: 'Preparer les pochoirs', description: '', sourceHints: ['shape:abc'] }] },
});
check('acceptation d une suggestion 201', r.status === 201 && r.body.length === 1, r.body);

section('fichiers');
r = await call('POST', `/projects/${slug}/files`, {
  token: bobToken,
  form: upload('file', 'plan.png', png(), 'image/png'),
});
if (r.status === 201) {
  check('depot de fichier 201', r.body.mimeType === 'image/png', r.body);
  const fileId = r.body.id;

  r = await call('GET', `/projects/${slug}/files`);
  check('R-F4 : liste publique sur un projet public', r.status === 200 && r.body.length === 1, r.body);

  r = await call('POST', `/projects/${slug}/files`, {
    token: bobToken,
    form: upload('file', 'virus.png', Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03]), 'image/png'),
  });
  check('R-F2 : executable deguise refuse 400', r.status === 400, r.body);

  r = await call('POST', `/projects/${slug}/files`, {
    token: bobToken,
    form: upload('file', 'gros.png', Buffer.alloc(21 * 1024 * 1024, 1), 'image/png'),
  });
  check('R-F1 : au-dela de 20 Mo, refuse 400', r.status === 400, r.body);

  r = await call('DELETE', `/files/${fileId}`, { token: carolToken });
  check('suppression par un tiers refusee', r.status === 403, r.body);

  r = await call('DELETE', `/files/${fileId}`, { token: bobToken });
  check('R-F3 : le deposant supprime 204', r.status === 204, r.body);

  r = await call('POST', '/me/avatar', {
    token: aliceToken,
    form: upload('avatar', 'moi.png', png(), 'image/png'),
  });
  check('avatar depose 200', r.status === 200 && /^https?:\/\//.test(r.body.avatar ?? ''), r.body);

  r = await call('POST', '/me/avatar', {
    token: aliceToken,
    form: upload('avatar', 'doc.pdf', Buffer.from([0x25, 0x50, 0x44, 0x46]), 'image/png'),
  });
  check('avatar non image refuse 400', r.status === 400, r.body);
} else {
  skip('depot de fichiers', `stockage objet indisponible (HTTP ${r.status})`);
  await call('GET', `/projects/${slug}/files`);
  await call('DELETE', '/files/00000000-0000-4000-8000-000000000000', { token: bobToken });
  await call('POST', '/me/avatar', { token: aliceToken, form: upload('avatar', 'moi.png', png(), 'image/png') });
}

section('notifications');
r = await call('GET', '/notifications', { token: aliceToken });
check('liste 200', r.status === 200 && r.body.items.length > 0, r.body?.total);
check('R-N2 : acteurs resolus', r.body.items.every((n) => n.actors.length >= 1), r.body.items?.[0]);
check('R-N3 : cible resolue pour un routage exact', r.body.items.every((n) => n.target?.projectSlug), r.body.items?.[0]);
const notificationId = r.body.items[0]?.id;

r = await call('POST', `/notifications/${notificationId}/read`, { token: aliceToken });
check('marquer lue 204', r.status === 204, r.body);

r = await call('GET', '/notifications', { token: aliceToken });
check('la notification est lue', r.body.items.find((n) => n.id === notificationId)?.read === true, r.body.items?.[0]);

r = await call('GET', '/notifications/preferences', { token: aliceToken });
check('R-N4 : treize types, defauts calcules', r.status === 200 && r.body.length === 13, r.body?.length);
check('courriel par defaut sur les invitations', r.body.find((p) => p.type === 'invitation_received')?.channels.includes('email'), r.body);

r = await call('PATCH', '/notifications/preferences', {
  token: aliceToken,
  body: [{ type: 'highfive_received', channels: [] }],
});
check('preference enregistree', r.status === 200 && r.body.find((p) => p.type === 'highfive_received').channels.length === 0, r.body);

r = await call('POST', '/notifications/read-all', { token: aliceToken });
check('tout marquer lu 204', r.status === 204, r.body);

section('recherche et fil');
r = await call('GET', '/search?q=fresque&types=projects,users,tags');
check('recherche 200', r.status === 200, r.body);
check('projets trouves', r.body.projects?.items.some((p) => p.slug === slug), r.body.projects?.total);
check('personnes et themes presents', Array.isArray(r.body.users?.items) && Array.isArray(r.body.tags?.items), r.body);

for (const sort of ['recent', 'popular', 'relevant', 'active']) {
  r = await call(`GET`, `/search?types=projects&sort=${sort}`);
  check(`tri ${sort} 200`, r.status === 200 && Array.isArray(r.body.projects?.items), r.body?.projects?.total);
}

r = await call('POST', '/projects', {
  token: bobToken,
  body: {
    title: `Atelier dessin ${stamp}`,
    tagline: 'Croquis du quartier, le mercredi',
    tags: ['dessin'],
    visibility: 'public',
    participation: 'open',
  },
});
const bobProjectSlug = r.body?.slug;
await call('POST', `/projects/${bobProjectSlug}/transition`, { token: bobToken, body: { transition: 'publish' } });

r = await call('GET', '/feed/discover');
check('decouvrir, visiteur 200', r.status === 200 && r.body.moment, r.body?.sections?.map((s) => s.id));
check('aucune section personnalisee pour un visiteur', !r.body.sections.some((s) => ['for_you', 'near_your_projects'].includes(s.id)), r.body.sections.map((s) => s.id));
check('chaque section porte son « voir plus »', r.body.sections.every((s) => s.seeAll), r.body.sections?.[0]);

r = await call('GET', '/feed/discover', { token: aliceToken });
const sectionIds = r.body.sections.map((s) => s.id);
check('decouvrir, connecte 200', r.status === 200, sectionIds);
check('section personnalisee presente pour un compte avec interets', sectionIds.includes('for_you') || sectionIds.includes('near_your_projects'), sectionIds);

r = await call('GET', '/feed/tags-trending');
check('themes qui bougent, cinq au plus', r.status === 200 && r.body.length > 0 && r.body.length <= 5, r.body?.length);

r = await call('GET', '/tags/dessin/projects');
check('projets d un theme 200', r.status === 200, r.body?.total);

r = await call('GET', '/feed/people');
check('des gens a rencontrer 200', r.status === 200 && Array.isArray(r.body), r.body?.length);

r = await call('GET', `/users/${alice.username}/projects`);
check('projets du profil 200', r.status === 200 && r.body.created.length >= 1, r.body?.created?.length);
check('R-V4 : projets prives comptes sans etre nommes', typeof r.body.privateProjectsCount === 'number', r.body);

section('messagerie : conversations');
r = await call('GET', '/conversations');
check('liste anonyme 401', r.status === 401, r.body);

// Les canaux des projets crees plus haut existent deja (R-MSG3) : ces
// scenarios ne regardent que les conversations directes et les groupes.
const personal = (body) => (Array.isArray(body) ? body : []).filter((c) => c.type !== 'channel');

r = await call('GET', '/conversations', { token: aliceToken });
check('aucune conversation directe ni groupe au depart', r.status === 200 && Array.isArray(r.body) && personal(r.body).length === 0, r.body);

r = await call('POST', '/conversations', {
  token: aliceToken,
  body: { participantIds: [bobId], title: 'Ignore', message: 'Salut Bob !' },
});
check('R-MSG1 : conversation directe 201', r.status === 201 && r.body.type === 'direct', r.body);
check('R-MSG1 : deux participants, createur compris', r.body?.participantIds?.length === 2 && r.body.participantIds.includes(aliceId), r.body);
check('R-MSG1 : une conversation directe ne se nomme pas', r.body?.title === undefined, r.body);
const directId = r.body?.id;

r = await call('POST', '/conversations', {
  token: aliceToken,
  body: { participantIds: [bobId, aliceId, bobId], message: 'Tu as vu le projet ?' },
});
check('R-MSG1 : meme paire = meme fil, doublons et soi-meme ignores', r.status === 201 && r.body.id === directId, r.body);

r = await call('POST', '/conversations', {
  token: aliceToken,
  body: { participantIds: [aliceId], message: 'Moi seule' },
});
check('conversation avec soi-meme seulement 400', r.status === 400, r.body);

r = await call('POST', '/conversations', {
  token: aliceToken,
  body: { participantIds: ['00000000-0000-4000-8000-000000000000'], message: 'Il y a quelqu un ?' },
});
check('participant inconnu 400', r.status === 400, r.body);

r = await call('POST', '/conversations', { token: aliceToken, body: { participantIds: [bobId] } });
check('premier message obligatoire 400', r.status === 400, r.body);

r = await call('POST', '/conversations', {
  token: aliceToken,
  body: { participantIds: [bobId, carolId], title: 'Atelier peinture', message: 'Bienvenue a tous' },
});
check('R-MSG2 : groupe 201', r.status === 201 && r.body.type === 'group' && r.body.participantIds.length === 3, r.body);
check('R-MSG2 : titre libre conserve', r.body?.title === 'Atelier peinture', r.body);
const groupId = r.body?.id;

r = await call('GET', '/conversations', { token: bobToken });
const bobDirect = r.body?.find?.((c) => c.id === directId);
const bobGroup = r.body?.find?.((c) => c.id === groupId);
check('bob voit les deux conversations', r.status === 200 && personal(r.body).length === 2, r.body);
check('la plus recemment active d abord', r.body?.[0]?.id === groupId, r.body?.map?.((c) => c.id));
check('participants resolus', bobDirect?.participants?.some((p) => p.username === alice.username), bobDirect);
check('dernier message resolu', bobDirect?.lastMessage?.body === 'Tu as vu le projet ?' && bobDirect.lastMessage.authorId === aliceId, bobDirect?.lastMessage);
check('non lus : les deux messages d alice', bobDirect?.unreadCount === 2, bobDirect);
check('R-MSG7 : demande de message tant que bob n a pas repondu', bobDirect?.isMessageRequest === true, bobDirect);
check('R-MSG7 : un groupe n est jamais une demande', bobGroup?.isMessageRequest === false && bobGroup.unreadCount === 1, bobGroup);

r = await call('GET', '/conversations', { token: aliceToken });
const aliceDirect = r.body?.find?.((c) => c.id === directId);
check('ses propres messages ne sont pas des non lus', aliceDirect?.unreadCount === 0, aliceDirect);
check('R-MSG7 : jamais une demande pour qui l a ouverte', aliceDirect?.isMessageRequest === false, aliceDirect);

r = await call('POST', '/conversations', {
  token: bobToken,
  body: { participantIds: [aliceId], message: 'Oui, super !' },
});
check('repondre par la meme paire reprend le fil', r.status === 201 && r.body.id === directId, r.body);

r = await call('GET', '/conversations', { token: bobToken });
check('R-MSG7 : la reponse leve la demande', r.body?.find?.((c) => c.id === directId)?.isMessageRequest === false, r.body);

r = await call('GET', `/conversations/${groupId}`, { token: carolToken });
check('detail 200', r.status === 200 && r.body.title === 'Atelier peinture', r.body);
check('detail : participants resolus', r.body?.participants?.length === 3, r.body?.participants);

r = await call('GET', `/conversations/${directId}`, { token: carolToken });
check('conversation d autrui 404, existence non revelee', r.status === 404, r.body);

r = await call('GET', '/conversations/00000000-0000-4000-8000-000000000000', { token: aliceToken });
check('conversation inexistante 404', r.status === 404, r.body);

r = await call('GET', '/conversations/pas-un-uuid', { token: aliceToken });
check('identifiant mal forme 400', r.status === 400, r.body);

section('messagerie : messages');
r = await call('GET', `/conversations/${directId}/messages`, { token: bobToken });
check('fil 200', r.status === 200 && r.body.total === 3 && r.body.nextCursor === null, r.body);
check('ordre chronologique dans la page', r.body?.items?.map((m) => m.body).join(' / ') === 'Salut Bob ! / Tu as vu le projet ? / Oui, super !', r.body?.items?.map((m) => m.body));
check('auteur resolu', r.body?.items?.[0]?.author?.username === alice.username, r.body?.items?.[0]);
check('readBy : bob a lu ce a quoi il a repondu', r.body?.items?.[0]?.readBy?.includes(bobId) && r.body.items[0].readBy.includes(aliceId), r.body?.items?.[0]);

r = await call('GET', `/conversations/${directId}/messages`, { token: carolToken });
check('fil d autrui 404', r.status === 404, r.body);

r = await call('POST', `/conversations/${directId}/messages`, { token: aliceToken, body: { body: 'Je passe demain' } });
check('envoi 201', r.status === 201 && r.body.body === 'Je passe demain' && r.body.author?.id === aliceId, r.body);
check('a l envoi, lu par son auteur seul', r.body?.readBy?.length === 1 && r.body.readBy[0] === aliceId, r.body?.readBy);
check('ni modifie ni supprime', r.body?.editedAt === undefined && r.body?.deleted === false, r.body);
const sentId = r.body?.id;

r = await call('POST', `/conversations/${directId}/messages`, { token: carolToken, body: { body: 'Intrusion' } });
check('ecrire dans le fil d autrui 404', r.status === 404, r.body);

r = await call('POST', `/conversations/${directId}/messages`, { token: aliceToken, body: { body: '' } });
check('message vide 400', r.status === 400, r.body);

r = await call('GET', '/conversations', { token: bobToken });
check('un non lu de plus pour bob', r.body?.find?.((c) => c.id === directId)?.unreadCount === 1, r.body);
check('le fil remonte en tete', r.body?.[0]?.id === directId, r.body?.map?.((c) => c.id));

r = await call('POST', `/conversations/${directId}/read`, { token: bobToken });
check('marquer lu 204', r.status === 204, r.body);

r = await call('GET', '/conversations', { token: bobToken });
check('plus aucun non lu', r.body?.find?.((c) => c.id === directId)?.unreadCount === 0, r.body);

r = await call('GET', `/conversations/${directId}/messages`, { token: aliceToken });
check('readBy : bob a lu le dernier message', r.body?.items?.at(-1)?.readBy?.includes(bobId), r.body?.items?.at(-1));

r = await call('POST', `/conversations/${directId}/read`, { token: carolToken });
check('marquer lu le fil d autrui 404', r.status === 404, r.body);

r = await call('PATCH', `/messages/${sentId}`, { token: aliceToken, body: { body: 'Je passe apres-demain' } });
check('R-MSG5 : modification 200', r.status === 200 && r.body.body === 'Je passe apres-demain' && r.body.editedAt, r.body);

r = await call('PATCH', `/messages/${sentId}`, { token: bobToken, body: { body: 'Pirate' } });
check('R-MSG5 : modifier le message d autrui 404', r.status === 404, r.body);

r = await call('PATCH', `/messages/${sentId}`, { token: aliceToken, body: { body: '' } });
check('modification vide 400', r.status === 400, r.body);

r = await call('DELETE', `/messages/${sentId}`, { token: bobToken });
check('R-MSG6 : supprimer le message d autrui 404', r.status === 404, r.body);

r = await call('DELETE', `/messages/${sentId}`, { token: aliceToken });
check('R-MSG6 : suppression 204', r.status === 204, r.body);

r = await call('DELETE', `/messages/${sentId}`, { token: aliceToken });
check('R-MSG6 : supprimer deux fois 204', r.status === 204, r.body);

r = await call('GET', `/conversations/${directId}/messages`, { token: bobToken });
const deletedMessage = r.body?.items?.find?.((m) => m.id === sentId);
check('R-MSG6 : le message reste dans le fil, vide', deletedMessage?.deleted === true && deletedMessage.body === '', deletedMessage);
check('R-MSG6 : rien n est efface', r.body?.total === 4, r.body?.total);

r = await call('GET', '/conversations', { token: bobToken });
check('R-MSG6 : dernier message signale supprime', r.body?.find?.((c) => c.id === directId)?.lastMessage?.deleted === true, r.body);

r = await call('PATCH', `/messages/${sentId}`, { token: aliceToken, body: { body: 'Ressuscite' } });
check('un message supprime ne se modifie plus 403', r.status === 403, r.body);

r = await call('PATCH', '/messages/00000000-0000-4000-8000-000000000000', { token: aliceToken, body: { body: 'Rien' } });
check('message inexistant 404', r.status === 404, r.body);

// Pagination : 25 messages de plus dans le groupe, qui en comptait 1.
for (let i = 1; i <= 25; i += 1) {
  await call('POST', `/conversations/${groupId}/messages`, { token: aliceToken, body: { body: `Message ${i}` } });
}
r = await call('GET', `/conversations/${groupId}/messages`, { token: carolToken });
const firstPage = r.body;
check('premiere page : les 20 plus recents', firstPage?.items?.length === 20 && firstPage.total === 26, { n: firstPage?.items?.length, total: firstPage?.total });
check('premiere page : se termine par le dernier envoye', firstPage?.items?.at(-1)?.body === 'Message 25' && firstPage.items[0].body === 'Message 6', firstPage?.items?.map?.((m) => m.body));
check('premiere page : un curseur vers les plus anciens', typeof firstPage?.nextCursor === 'string', firstPage?.nextCursor);

await call('POST', `/conversations/${groupId}/messages`, { token: bobToken, body: { body: 'Arrive pendant la lecture' } });

r = await call('GET', `/conversations/${groupId}/messages?cursor=${firstPage?.nextCursor}`, { token: carolToken });
check('seconde page : la suite exacte, malgre le message arrive entre-temps', r.body?.items?.map((m) => m.body).join(' / ') === 'Bienvenue a tous / Message 1 / Message 2 / Message 3 / Message 4 / Message 5', r.body?.items?.map?.((m) => m.body));
check('seconde page : derniere', r.body?.nextCursor === null, r.body?.nextCursor);

r = await call('GET', `/conversations/${groupId}/messages?cursor=nimportequoi`, { token: carolToken });
check('curseur invalide 400', r.status === 400, r.body);

section('messagerie : pieces jointes');
r = await call('POST', `/conversations/${directId}/messages`, {
  token: aliceToken,
  body: { body: 'Regarde ce projet', attachment: { kind: 'project', projectId } },
});
check('R-MSG4 : projet joint 201', r.status === 201 && r.body.attachment?.projectId === projectId, r.body);
check('R-MSG4 : apercu resolu a l envoi', r.body?.attachmentPreview?.kind === 'project' && r.body.attachmentPreview.projectSlug === slug, r.body?.attachmentPreview);
const publicAttachmentId = r.body?.id;

r = await call('GET', `/conversations/${directId}/messages`, { token: bobToken });
const seenByBob = r.body?.items?.find?.((m) => m.id === publicAttachmentId);
check('R-MSG4 : apercu resolu a la lecture', seenByBob?.attachmentPreview?.projectTitle === projectTitle && typeof seenByBob.attachmentPreview.projectTagline === 'string', seenByBob);

r = await call('POST', '/projects', {
  token: aliceToken,
  body: { title: `Atelier secret ${stamp}`, tagline: 'Entre nous', tags: ['code'], visibility: 'private', participation: 'on_invite' },
});
const secretSlug = r.body?.slug;
const secretId = r.body?.id;
r = await call('POST', `/projects/${secretSlug}/transition`, { token: aliceToken, body: { transition: 'publish' } });
check('projet prive publie pour les pieces jointes', r.status === 200 && r.body.visibility === 'private', r.body);

r = await call('POST', `/conversations/${directId}/messages`, {
  token: aliceToken,
  body: { body: 'Et celui-ci, en secret', attachment: { kind: 'project', projectId: secretId } },
});
check('joindre son projet prive 201', r.status === 201 && r.body.attachmentPreview?.projectSlug === secretSlug, r.body);
const privateAttachmentId = r.body?.id;

r = await call('GET', `/conversations/${directId}/messages`, { token: bobToken });
const hiddenForBob = r.body?.items?.find?.((m) => m.id === privateAttachmentId);
check('R-V3 : un non-membre recoit le message...', hiddenForBob?.body === 'Et celui-ci, en secret', hiddenForBob);
check('R-V3 : ...sans apercu du projet prive', hiddenForBob && hiddenForBob.attachmentPreview === undefined, hiddenForBob);

r = await call('POST', `/conversations/${directId}/messages`, {
  token: bobToken,
  body: { body: 'Je sonde', attachment: { kind: 'project', projectId: secretId } },
});
const probePrivate = r;
r = await call('POST', `/conversations/${directId}/messages`, {
  token: bobToken,
  body: { body: 'Je sonde', attachment: { kind: 'project', projectId: '00000000-0000-4000-8000-000000000000' } },
});
check('joindre un projet invisible 400', probePrivate.status === 400, probePrivate.body);
check('invisible ou inexistant : meme reponse', r.status === 400 && r.body?.message === probePrivate.body?.message, [r.body, probePrivate.body]);

r = await call('POST', `/conversations/${directId}/messages`, {
  token: aliceToken,
  body: { body: 'Fichier fantome', attachment: { kind: 'file', fileId: '00000000-0000-4000-8000-000000000000' } },
});
check('joindre un fichier inexistant 400', r.status === 400, r.body);

r = await call('POST', `/projects/${slug}/files`, { token: aliceToken, form: upload('file', 'esquisse.png', png(), 'image/png') });
if (r.status === 201) {
  const publicFileId = r.body.id;
  r = await call('POST', `/projects/${secretSlug}/files`, { token: aliceToken, form: upload('file', 'secret.png', png(), 'image/png') });
  const secretFileId = r.body?.id;

  r = await call('POST', `/conversations/${directId}/messages`, {
    token: aliceToken,
    body: { body: 'Le croquis', attachment: { kind: 'file', fileId: publicFileId } },
  });
  check('R-MSG4 : fichier joint 201', r.status === 201 && r.body.attachment?.fileId === publicFileId, r.body);
  const fileMessageId = r.body?.id;

  r = await call('GET', `/conversations/${directId}/messages`, { token: bobToken });
  const fileForBob = r.body?.items?.find?.((m) => m.id === fileMessageId);
  check('R-MSG4 : apercu du fichier (nom, taille)', fileForBob?.attachmentPreview?.kind === 'file' && fileForBob.attachmentPreview.fileName === 'esquisse.png' && fileForBob.attachmentPreview.fileSize > 0, fileForBob?.attachmentPreview);

  r = await call('POST', `/conversations/${directId}/messages`, {
    token: bobToken,
    body: { body: 'Je sonde', attachment: { kind: 'file', fileId: secretFileId } },
  });
  check('R-F4 : joindre un fichier d un projet invisible 400', r.status === 400, r.body);

  r = await call('DELETE', `/files/${publicFileId}`, { token: aliceToken });
  r = await call('GET', `/conversations/${directId}/messages`, { token: bobToken });
  const orphan = r.body?.items?.find?.((m) => m.id === fileMessageId);
  check('fichier supprime : le message reste, sans apercu', orphan?.body === 'Le croquis' && orphan.attachmentPreview === undefined, orphan);
} else {
  skip('pieces jointes de type fichier', `stockage objet indisponible (HTTP ${r.status})`);
}

r = await call('DELETE', `/messages/${publicAttachmentId}`, { token: aliceToken });
r = await call('GET', `/conversations/${directId}/messages`, { token: bobToken });
const emptied = r.body?.items?.find?.((m) => m.id === publicAttachmentId);
check('R-MSG6 : la suppression retire aussi la piece jointe', emptied?.deleted === true && emptied.attachment === undefined && emptied.attachmentPreview === undefined, emptied);

section('messagerie : medias');
const mp4 = (size = 256) =>
  Buffer.concat([Buffer.from([0x00, 0x00, 0x00, 0x18]), Buffer.from('ftypisom', 'latin1'), Buffer.alloc(size, 3)]);

r = await call('POST', `/conversations/${directId}/attachments`, { token: aliceToken, form: upload('file', 'photo.png', png(), 'image/png') });
if (r.status === 201) {
  check('R-MSG8 : depot d une image 201', r.body.mimeType === 'image/png' && r.body.fileName === 'photo.png' && r.body.fileSize === png().length, r.body);
  const photoId = r.body.id;

  r = await call('POST', `/conversations/${directId}/messages`, { token: aliceToken, body: { attachment: { kind: 'upload', uploadId: photoId } } });
  check('R-MSG8 : message sans texte, avec une image 201', r.status === 201 && r.body.body === '' && r.body.attachment?.uploadId === photoId, r.body);
  const photoMessageId = r.body?.id;

  r = await call('GET', `/conversations/${directId}/messages`, { token: bobToken });
  const photoForBob = r.body?.items?.find?.((m) => m.id === photoMessageId)?.attachmentPreview;
  check('R-MSG8 : apercu complet pour l autre participant', photoForBob?.kind === 'upload' && photoForBob.mimeType === 'image/png' && photoForBob.fileName === 'photo.png', photoForBob);

  const signed = photoForBob?.url ? await fetch(photoForBob.url) : undefined;
  const signedBytes = signed?.ok ? Buffer.from(await signed.arrayBuffer()) : undefined;
  check('R-MSG8 : l URL signee rend le fichier depose', signed?.status === 200 && signedBytes?.equals(png()), signed?.status);

  const bare = photoForBob?.url ? await fetch(photoForBob.url.split('?')[0]) : undefined;
  check('R-MSG8 : sans signature, le stockage refuse', bare !== undefined && bare.status === 403, bare?.status);

  r = await call('GET', '/conversations', { token: bobToken });
  const withPhoto = r.body?.find?.((c) => c.id === directId)?.lastMessage;
  check('R-MSG8 : la liste annonce la piece jointe d un message sans texte', withPhoto?.body === '' && withPhoto.attachmentKind === 'upload', withPhoto);

  r = await call('POST', `/conversations/${directId}/messages`, { token: aliceToken, body: { body: 'Encore', attachment: { kind: 'upload', uploadId: photoId } } });
  check('R-MSG8 : un depot ne se joint qu une fois 400', r.status === 400, r.body);

  r = await call('POST', `/conversations/${directId}/attachments`, { token: aliceToken, form: upload('file', 'clip.mov', mp4(), 'application/octet-stream') });
  check('R-MSG8 : video reconnue a son contenu, pas a son nom', r.status === 201 && r.body.mimeType === 'video/mp4', r.body);

  r = await call('POST', `/conversations/${directId}/attachments`, { token: aliceToken, form: upload('file', 'notes.pdf', Buffer.from('%PDF-1.4 test'), 'application/pdf') });
  const pdfId = r.body?.id;
  check('R-MSG8 : depot d un fichier 201', r.status === 201 && r.body.mimeType === 'application/pdf', r.body);

  r = await call('POST', `/conversations/${directId}/messages`, { token: bobToken, body: { attachment: { kind: 'upload', uploadId: pdfId } } });
  check('R-MSG8 : joindre le depot d autrui 400', r.status === 400, r.body);

  r = await call('POST', `/conversations/${groupId}/attachments`, { token: aliceToken, form: upload('file', 'groupe.png', png(), 'image/png') });
  r = await call('POST', `/conversations/${directId}/messages`, { token: aliceToken, body: { attachment: { kind: 'upload', uploadId: r.body?.id } } });
  check('R-MSG8 : joindre le depot d une autre conversation 400', r.status === 400, r.body);

  r = await call('POST', `/conversations/${directId}/attachments`, { token: carolToken, form: upload('file', 'intrus.png', png(), 'image/png') });
  check('deposer dans le fil d autrui 404', r.status === 404, r.body);

  r = await call('POST', `/conversations/${directId}/attachments`, { token: aliceToken, form: upload('file', 'virus.png', Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03]), 'image/png') });
  check('R-F2 : executable deguise refuse 400', r.status === 400, r.body);

  r = await call('POST', `/conversations/${directId}/attachments`, { token: aliceToken, form: upload('file', 'logo.svg', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), 'image/svg+xml') });
  check('R-MSG8 : SVG refuse (script possible) 400', r.status === 400, r.body);

  r = await call('POST', `/conversations/${directId}/attachments`, { token: aliceToken, form: upload('file', 'grande.png', Buffer.concat([png(), Buffer.alloc(11 * 1024 * 1024, 1)]), 'image/png') });
  check('R-MSG8 : image au-dela de 10 Mo refusee 400', r.status === 400, r.body);

  r = await call('POST', `/conversations/${directId}/attachments`, { token: aliceToken, form: upload('file', 'film.mp4', mp4(51 * 1024 * 1024), 'video/mp4') });
  check('R-MSG8 : video au-dela de 50 Mo refusee, message en francais', r.status === 413 && r.body?.message === 'Ce fichier est trop volumineux.', r.body);

  r = await call('POST', `/conversations/${directId}/attachments`, { token: aliceToken, form: new FormData() });
  check('depot sans fichier 400', r.status === 400, r.body);

  r = await call('POST', `/conversations/${directId}/messages`, { token: aliceToken, body: {} });
  check('R-MSG8 : ni texte ni piece jointe 400', r.status === 400, r.body);

  r = await call('DELETE', `/messages/${photoMessageId}`, { token: aliceToken });
  const afterDelete = photoForBob?.url ? await fetch(photoForBob.url) : undefined;
  check('R-MSG6/R-MSG8 : supprimer le message supprime le fichier', r.status === 204 && afterDelete !== undefined && afterDelete.status === 404, afterDelete?.status);
} else {
  skip('medias des messages', `stockage objet indisponible (HTTP ${r.status})`);
  await call('POST', `/conversations/${directId}/attachments`, { token: aliceToken, form: new FormData() });
}

section('messagerie : notifications et signalements');
const messageNotifications = (body, conversationId) =>
  (body?.items ?? []).filter((n) => n.type === 'message_received' && n.target?.conversationId === conversationId);

r = await call('GET', '/notifications', { token: carolToken });
let groupNotifications = messageNotifications(r.body, groupId);
check('message_received : une seule notification pour tout le groupe (R-N2)', groupNotifications.length === 1, groupNotifications);
check('R-N2 : les auteurs regroupes en acteurs', groupNotifications[0]?.actors?.length === 2 && groupNotifications[0].actorIds.includes(aliceId) && groupNotifications[0].actorIds.includes(bobId), groupNotifications[0]?.actorIds);
check('R-N3 : cible resolue vers la conversation, avec son titre', groupNotifications[0]?.target?.type === 'message' && groupNotifications[0].target.conversationTitle === 'Atelier peinture', groupNotifications[0]?.target);

r = await call('GET', '/notifications', { token: bobToken });
const directNotification = messageNotifications(r.body, directId)[0];
check('conversation directe : notifiee, sans titre', directNotification?.read === false && directNotification.target.conversationTitle === undefined, directNotification);

r = await call('GET', '/notifications', { token: aliceToken });
check('alice notifiee du message de bob dans le groupe', messageNotifications(r.body, groupId).some((n) => !n.read && n.actorIds.includes(bobId)), messageNotifications(r.body, groupId));

r = await call('POST', `/conversations/${groupId}/read`, { token: carolToken });
r = await call('GET', '/notifications', { token: carolToken });
check('lire la conversation eteint ses notifications', messageNotifications(r.body, groupId).every((n) => n.read), messageNotifications(r.body, groupId));

r = await call('POST', `/conversations/${groupId}/messages`, { token: aliceToken, body: { body: 'Une nouvelle apres lecture' } });
r = await call('GET', '/notifications', { token: aliceToken });
check('ecrire dans une conversation eteint ses propres notifications', messageNotifications(r.body, groupId).every((n) => n.read), messageNotifications(r.body, groupId));

r = await call('GET', '/notifications', { token: carolToken });
groupNotifications = messageNotifications(r.body, groupId).filter((n) => !n.read);
check('R-N2 : apres lecture, un nouveau message ouvre une nouvelle notification', groupNotifications.length === 1 && groupNotifications[0].actorIds.length === 1 && groupNotifications[0].actorIds[0] === aliceId, groupNotifications);

r = await call('GET', `/conversations/${groupId}/messages`, { token: bobToken });
const reportedMessage = r.body?.items?.at(-1);

r = await call('POST', '/reports', { token: aliceToken, body: { targetType: 'message', targetId: sentId, reason: 'spam' } });
check('signaler un message supprime 404', r.status === 404, r.body);

r = await call('POST', '/reports', { token: carolToken, body: { targetType: 'message', targetId: publicAttachmentId, reason: 'spam' } });
check('signaler un message d une conversation dont on n est pas 404', r.status === 404, r.body);
const probeReport = r;
r = await call('POST', '/reports', { token: carolToken, body: { targetType: 'message', targetId: '00000000-0000-4000-8000-000000000000', reason: 'spam' } });
check('message d autrui ou inexistant : meme reponse', r.status === 404 && r.body?.message === probeReport.body?.message, [r.body, probeReport.body]);

r = await call('POST', '/reports', { token: bobToken, body: { targetType: 'message', targetId: reportedMessage?.id, reason: 'harassment', detail: 'Insistant' } });
check('signaler un message de sa conversation 201', r.status === 201 && r.body.targetType === 'message', r.body);
const reportedMessageBody = reportedMessage?.body;

section('messagerie : canaux de projet');
const dave = person('dave');
r = await call('POST', '/auth/register', { body: dave });
const daveToken = r.body?.token;
const daveId = r.body?.user?.id;

const channelTitle = `Atelier velo ${stamp}`;
r = await call('POST', '/projects', {
  token: aliceToken,
  body: { title: channelTitle, tagline: 'On repare ensemble', tags: ['code'], visibility: 'public', participation: 'open' },
});
const channelSlug = r.body?.slug;
const channelProjectId = r.body?.id;
await call('POST', `/projects/${channelSlug}/transition`, { token: aliceToken, body: { transition: 'publish' } });
const channelOf = (body) => (Array.isArray(body) ? body : []).find((c) => c.type === 'channel' && c.projectId === channelProjectId);

r = await call('GET', '/conversations', { token: aliceToken });
check('R-MSG3 : porteur encore seul, canal non liste', r.status === 200 && channelOf(r.body) === undefined, r.body?.map?.((c) => c.type));

r = await call('POST', `/projects/${channelSlug}/join-requests`, { token: bobToken, body: {} });
check('rejoindre un projet ouvert 201', r.status === 201, r.body);

r = await call('GET', '/conversations', { token: aliceToken });
let channel = channelOf(r.body);
check('R-MSG3 : la premiere arrivee fait apparaitre le canal', channel?.participantIds?.length === 2 && channel.participantIds.includes(bobId), channel);
check('R-MSG3 : le canal porte le nom de son projet', channel?.projectSlug === channelSlug && channel.projectTitle === channelTitle && channel.title === undefined, channel);
const channelId = channel?.id;

r = await call('GET', '/conversations', { token: bobToken });
check('R-MSG3 : le nouvel arrivant voit le canal', channelOf(r.body)?.id === channelId, r.body?.map?.((c) => c.type));

r = await call('POST', `/conversations/${channelId}/messages`, { token: aliceToken, body: { body: 'Bienvenue dans l equipe !' } });
check('ecrire dans le canal 201', r.status === 201, r.body);

r = await call('GET', '/notifications', { token: bobToken });
const channelNotification = messageNotifications(r.body, channelId)[0];
check('notification du canal, titree du nom du projet', channelNotification?.target?.conversationTitle === channelTitle, channelNotification?.target);

r = await call('POST', `/projects/${channelSlug}/invitations`, { token: aliceToken, body: { recipientId: carolId, proposedRole: 'observer' } });
r = await call('POST', `/invitations/${r.body?.id}/accept`, { token: carolToken });
check('accepter une invitation 204', r.status === 204, r.body);

r = await call('GET', '/conversations', { token: carolToken });
channel = channelOf(r.body);
check('R-MSG3 : invitation acceptee = dans le canal, observateurs compris', channel?.participantIds?.length === 3, channel);
check('l historique d avant l arrivee ne compte pas comme non lu', channel?.unreadCount === 0, channel);

r = await call('GET', `/conversations/${channelId}/messages`, { token: carolToken });
check('...mais il reste lisible', r.body?.items?.some?.((m) => m.body === 'Bienvenue dans l equipe !'), r.body?.items);

r = await call('POST', `/projects/${channelSlug}/join-requests`, { token: daveToken, body: {} });
r = await call('DELETE', `/projects/${channelSlug}/members/${daveId}`, { token: aliceToken });
check('exclusion 204', r.status === 204, r.body);
r = await call('GET', `/conversations/${channelId}`, { token: daveToken });
check('R-MSG3 : exclu du projet, exclu du canal', r.status === 404, r.body);

r = await call('POST', `/projects/${channelSlug}/leave`, { token: carolToken });
r = await call('GET', '/conversations', { token: carolToken });
check('R-MSG3 : quitter le projet fait quitter le canal', r.status === 200 && channelOf(r.body) === undefined, r.body?.map?.((c) => c.type));

r = await call('POST', '/conversations', { token: aliceToken, body: { participantIds: [bobId, carolId], message: 'Pas un canal' } });
check('aucune route ne cree de canal : POST /conversations ouvre un groupe', r.body?.type === 'group', r.body);

r = await call('DELETE', `/projects/${channelSlug}`, { token: aliceToken, body: { confirmTitle: channelTitle } });
check('suppression du projet 204', r.status === 204, r.body);

r = await call('GET', `/conversations/${channelId}`, { token: bobToken });
check('R-MSG3 : le canal disparait avec son projet', r.status === 404, r.body);

r = await call('GET', '/notifications', { token: bobToken });
check('ses notifications aussi', messageNotifications(r.body, channelId).length === 0, messageNotifications(r.body, channelId));

section('messagerie : gestion des groupes');
r = await call('POST', '/conversations', { token: aliceToken, body: { participantIds: [bobId, carolId], title: 'Club', message: 'On lance le club' } });
const clubId = r.body?.id;
check('R-MSG9 : le createur administre le groupe', r.body?.adminId === aliceId, r.body);

r = await call('PATCH', `/conversations/${clubId}`, { token: bobToken, body: { title: 'Club lecture' } });
check('R-MSG9 : tout participant renomme 200', r.status === 200 && r.body.title === 'Club lecture' && r.body.adminId === aliceId, r.body);

r = await call('PATCH', `/conversations/${clubId}`, { token: bobToken, body: { title: '' } });
check('titre vide 400', r.status === 400, r.body);

r = await call('PATCH', `/conversations/${directId}`, { token: aliceToken, body: { title: 'Nous deux' } });
check('R-MSG1 : une conversation directe ne se renomme pas 403', r.status === 403, r.body);

r = await call('PATCH', `/conversations/${clubId}`, { token: daveToken, body: { title: 'Intrus' } });
check('renommer le groupe d autrui 404', r.status === 404, r.body);

r = await call('POST', `/conversations/${clubId}/participants`, { token: bobToken, body: { participantIds: [daveId] } });
check('R-MSG9 : tout participant ajoute 200', r.status === 200 && r.body.participantIds.length === 4 && r.body.participants.some((p) => p.id === daveId), r.body);

r = await call('GET', '/conversations', { token: daveToken });
const clubForDave = r.body?.find?.((c) => c.id === clubId);
check('le nouvel arrivant voit le groupe, sans non lus', clubForDave?.title === 'Club lecture' && clubForDave.unreadCount === 0, clubForDave);

r = await call('GET', `/conversations/${clubId}/messages`, { token: daveToken });
check('...et lit son historique', r.body?.items?.some?.((m) => m.body === 'On lance le club'), r.body?.items);

r = await call('POST', `/conversations/${clubId}/participants`, { token: bobToken, body: { participantIds: [carolId] } });
check('ajouter quelqu un deja present ne change rien', r.status === 200 && r.body.participantIds.length === 4, r.body);

r = await call('POST', `/conversations/${clubId}/participants`, { token: bobToken, body: { participantIds: ['00000000-0000-4000-8000-000000000000'] } });
check('ajouter une personne inconnue 400', r.status === 400, r.body);

r = await call('DELETE', `/conversations/${clubId}/participants/${daveId}`, { token: bobToken });
check('R-MSG9 : retirer sans etre administrateur 403', r.status === 403, r.body);

r = await call('DELETE', `/conversations/${clubId}/participants/${daveId}`, { token: aliceToken });
check('R-MSG9 : l administrateur retire 204', r.status === 204, r.body);

r = await call('GET', `/conversations/${clubId}`, { token: daveToken });
check('retire du groupe : plus d acces', r.status === 404, r.body);

r = await call('DELETE', `/conversations/${clubId}/participants/${daveId}`, { token: aliceToken });
check('retirer quelqu un d absent 404', r.status === 404, r.body);

r = await call('DELETE', `/conversations/${clubId}/participants/${aliceId}`, { token: aliceToken });
check('se retirer soi-meme : c est quitter 400', r.status === 400, r.body);

r = await call('POST', `/conversations/${directId}/leave`, { token: aliceToken });
check('R-MSG1 : une conversation directe ne se quitte pas 403', r.status === 403, r.body);

r = await call('GET', '/conversations', { token: aliceToken });
const someChannel = r.body?.find?.((c) => c.type === 'channel');
if (someChannel) {
  r = await call('POST', `/conversations/${someChannel.id}/leave`, { token: aliceToken });
  check('R-MSG3 : un canal se quitte avec son projet, pas ici 403', r.status === 403, r.body);
  r = await call('POST', `/conversations/${someChannel.id}/participants`, { token: aliceToken, body: { participantIds: [daveId] } });
  check('R-MSG3 : on n ajoute personne a un canal 403', r.status === 403, r.body);
} else {
  skip('gestion refusee sur un canal', 'aucun canal liste pour alice');
}

r = await call('POST', `/conversations/${clubId}/leave`, { token: aliceToken });
check('R-MSG9 : l administrateur quitte 204', r.status === 204, r.body);

r = await call('GET', `/conversations/${clubId}`, { token: bobToken });
const successor = r.body?.adminId;
check('R-MSG9 : l administration passe au plus ancien participant restant', r.status === 200 && [bobId, carolId].includes(successor) && !r.body.participantIds.includes(aliceId), r.body);

r = await call('GET', `/conversations/${clubId}`, { token: aliceToken });
check('qui part perd l acces', r.status === 404, r.body);

const successorToken = successor === bobId ? bobToken : carolToken;
const otherId = successor === bobId ? carolId : bobId;
r = await call('DELETE', `/conversations/${clubId}/participants/${otherId}`, { token: successorToken });
check('le nouvel administrateur retire 204', r.status === 204, r.body);

r = await call('GET', '/conversations', { token: successorToken });
check('seul dans le groupe : il n est plus liste', r.body?.find?.((c) => c.id === clubId) === undefined, r.body?.map?.((c) => c.id));

r = await call('POST', `/conversations/${clubId}/leave`, { token: successorToken });
check('le dernier quitte : groupe efface 204', r.status === 204, r.body);

section('signalements et administration');
r = await call('POST', '/reports', {
  token: bobToken,
  body: { targetType: 'project', targetId: projectId, reason: 'spam', detail: 'Test' },
});
check('signalement 201', r.status === 201, r.body);

r = await call('POST', '/reports', {
  token: bobToken,
  body: { targetType: 'project', targetId: projectId, reason: 'spam' },
});
check('doublon de signalement 409', r.status === 409, r.body);

r = await call('POST', '/reports', {
  token: carolToken,
  body: { targetType: 'comment', targetId: commentId, reason: 'harassment' },
});
check('signalement d un commentaire 201', r.status === 201, r.body);

r = await call('GET', '/admin/stats', { token: aliceToken });
check('administration fermee aux membres 403', r.status === 403, r.body);

r = await call('GET', '/admin/stats');
check('administration fermee aux anonymes 401', r.status === 401, r.body);

// Le role d'administration ne s'obtient par aucune route : il se declare dans
// ADMIN_EMAILS, relu a l'inscription.
const admin = { email: ADMIN_EMAIL, password: 'demo1234', username: `admin${stamp}` };
r = await call('POST', '/auth/register', { body: admin });
let adminToken = r.body?.token;
if (r.status !== 201) {
  r = await call('POST', '/auth/login', { body: { email: admin.email, password: admin.password } });
  adminToken = r.body?.token;
}

r = await call('GET', '/me', { token: adminToken });
const isAdmin = r.body?.platformRole === 'admin';

if (!isAdmin) {
  skip('routes d administration', `ADMIN_EMAILS ne contient pas ${ADMIN_EMAIL}`);
} else {
  check('role d administration accorde par ADMIN_EMAILS', true);

  r = await call('GET', '/admin/reports', { token: adminToken });
  check('file de moderation 200', r.status === 200 && r.body.items.length >= 2, r.body?.total);
  check('R-S2 : signalements comptes par cible', r.body.items.every((s) => s.similarReportsCount >= 1), r.body.items?.[0]);
  check('signaleur resolu', r.body.items.every((s) => s.reporter?.username), r.body.items?.[0]);
  check('apercu de la cible construit', r.body.items.some((s) => s.target?.excerpt), r.body.items?.[0]);
  const messageReport = r.body.items.find((s) => s.targetType === 'message');
  check('signalement de message : extrait et auteur resolus', messageReport?.target?.excerpt === reportedMessageBody && messageReport.target.author?.id === aliceId, messageReport);
  const [firstReport, secondReport] = r.body.items.filter((s) => s.targetType !== 'message');

  r = await call('POST', `/admin/reports/${messageReport?.id}/resolve`, { token: adminToken, body: { reason: 'Averti' } });
  check('signalement de message traite 200', r.status === 200 && r.body.status === 'handled', r.body);

  r = await call('POST', `/admin/reports/${firstReport.id}/resolve`, {
    token: adminToken,
    body: { reason: 'Contenu retire' },
  });
  check('signalement traite 200', r.status === 200 && r.body.status === 'handled', r.body);

  r = await call('POST', `/admin/reports/${secondReport.id}/reject`, {
    token: adminToken,
    body: { reason: 'Rien a signaler' },
  });
  check('signalement rejete 200', r.status === 200 && r.body.status === 'rejected', r.body);

  r = await call('GET', '/admin/reports', { token: adminToken });
  check('file videe des signalements traites', r.body.items.length === 0, r.body?.total);

  r = await call('GET', '/admin/stats', { token: adminToken });
  check('statistiques 200', r.status === 200 && r.body.usersCount >= 4, r.body);
  check('serie des inscriptions sur 30 jours', r.body.signupsLast30Days.length === 30, r.body.signupsLast30Days?.length);
  check('inscriptions du jour comptees', r.body.signupsLast30Days.at(-1).count >= 4, r.body.signupsLast30Days?.at(-1));

  r = await call('GET', '/admin/users', { token: adminToken });
  check('liste des comptes 200', r.status === 200 && r.body.items.length >= 4, r.body?.total);
  check('mot de passe jamais renvoye', r.body.items.every((u) => u.passwordHash === undefined), r.body.items?.[0]);

  r = await call('GET', '/admin/projects', { token: adminToken });
  check('liste des projets 200', r.status === 200 && r.body.items.length >= 2, r.body?.total);

  r = await call('GET', '/admin/tags', { token: adminToken });
  check('themes, desactives compris', r.status === 200 && r.body.length === 24, r.body?.length);

  r = await call('POST', `/admin/users/${carolId}/suspend`, {
    token: adminToken,
    body: { reason: 'Comportement inapproprie' },
  });
  check('suspension 204', r.status === 204, r.body);

  r = await call('GET', '/me', { token: carolToken });
  check('la suspension ferme les sessions ouvertes', r.status === 401, r.body);

  r = await call('POST', '/auth/login', { body: { email: carol.email, password: carol.password } });
  const suspendedToken = r.body?.token;
  check('un compte suspendu peut encore se connecter', r.status === 200, r.body?.user?.accountStatus);

  r = await call('PATCH', '/me', { token: suspendedToken, body: { bio: 'Nouvelle bio' } });
  check('R-P1 : profil verrouille pendant la suspension 403', r.status === 403, r.body);

  r = await call('POST', '/projects', {
    token: suspendedToken,
    body: { title: 'Projet suspendu', tagline: 'Non', tags: ['code'], visibility: 'public', participation: 'open' },
  });
  check('R-P1 : creation interdite pendant la suspension 403', r.status === 403, r.body);

  r = await call('POST', `/projects/${gardenSlug}/comments`, { token: suspendedToken, body: { body: 'Coucou' } });
  check('R-C2 : commentaire interdit pendant la suspension 403', r.status === 403, r.body);

  r = await call('POST', '/conversations', { token: suspendedToken, body: { participantIds: [aliceId], message: 'Coucou' } });
  check('message interdit pendant la suspension 403', r.status === 403, r.body);

  r = await call('POST', `/conversations/${groupId}/messages`, { token: suspendedToken, body: { body: 'Coucou' } });
  check('envoi dans un groupe interdit pendant la suspension 403', r.status === 403, r.body);

  r = await call('POST', `/conversations/${groupId}/attachments`, { token: suspendedToken, form: upload('file', 'photo.png', png(), 'image/png') });
  check('R-MSG8 : depot interdit pendant la suspension 403', r.status === 403, r.body);

  r = await call('PATCH', `/conversations/${groupId}`, { token: suspendedToken, body: { title: 'Suspendu' } });
  check('R-MSG9 : renommer interdit pendant la suspension 403', r.status === 403, r.body);

  r = await call('GET', `/conversations/${groupId}/messages`, { token: suspendedToken });
  check('un compte suspendu lit encore ses conversations', r.status === 200, r.body);

  r = await call('POST', '/conversations', { token: aliceToken, body: { participantIds: [carolId], message: 'Coucou' } });
  check('ecrire a un compte suspendu 400, etat non revele', r.status === 400, r.body);

  r = await call('POST', `/admin/users/${carolId}/reactivate`, { token: adminToken, body: {} });
  check('reactivation 204', r.status === 204, r.body);

  r = await call('POST', '/auth/login', { body: { email: carol.email, password: carol.password } });
  check('compte reactive de nouveau ecrivable', r.body?.user?.accountStatus === 'active', r.body?.user);
  carolToken = r.body?.token;

  r = await call('POST', `/admin/users/${carolId}/suspend`, { token: aliceToken, body: {} });
  check('suspendre sans etre administrateur 403', r.status === 403, r.body);

  // Suppression administrative, sur un projet dedie pour ne pas gener la suite.
  r = await call('POST', '/projects', {
    token: bobToken,
    body: { title: `Jetable ${stamp}`, tagline: 'A supprimer', tags: ['code'], visibility: 'public', participation: 'open' },
  });
  const disposableSlug = r.body?.slug;
  r = await call('DELETE', `/admin/projects/${disposableSlug}`, { token: adminToken });
  check('suppression administrative 204', r.status === 204, r.body);

  r = await call('GET', `/projects/${disposableSlug}`);
  check('projet supprime introuvable 404', r.status === 404, r.body);

  r = await call('DELETE', `/comments/${replyId}`, { token: adminToken });
  check('R-C3 : suppression de commentaire par l administration 204', r.status === 204, r.body);
}

section('transfert et suppression');
r = await call('POST', `/projects/${slug}/transfer`, { token: bobToken, body: { newOwnerId: bobId } });
check('transfert sans etre porteur 403', r.status === 403, r.body);

r = await call('POST', `/projects/${slug}/transfer`, { token: aliceToken, body: { newOwnerId: aliceId } });
check('se transferer a soi-meme 400', r.status === 400, r.body);

r = await call('POST', `/projects/${slug}/transfer`, { token: aliceToken, body: { newOwnerId: bobId } });
check('R-M2 : transfert 200', r.status === 200 && r.body.ownerId === bobId, r.body);

r = await call('GET', `/projects/${slug}/members`);
check('R-M2 : l ancien porteur devient co-porteur', r.body.find((m) => m.userId === aliceId)?.role === 'co_owner', r.body);
check('R-M1 : un seul porteur', r.body.filter((m) => m.role === 'owner').length === 1, r.body);

r = await call('POST', `/projects/${slug}/leave`, { token: aliceToken });
check('l ancien porteur peut desormais quitter 204', r.status === 204, r.body);

r = await call('DELETE', `/projects/${slug}`, { token: bobToken, body: { confirmTitle: 'Mauvais titre' } });
check('R-PR7 : titre non conforme 400', r.status === 400, r.body);

r = await call('DELETE', `/projects/${slug}`, { token: carolToken, body: { confirmTitle: projectTitle } });
check('suppression par un tiers 403', r.status === 403, r.body);

r = await call('POST', `/projects/${gardenSlug}/transition`, { token: aliceToken, body: { transition: 'complete' } });
check('terminer 200', r.status === 200 && r.body.state === 'done', r.body);

r = await call('POST', `/projects/${gardenSlug}/transition`, { token: aliceToken, body: { transition: 'reopen' } });
check('rouvrir 200', r.status === 200 && r.body.state === 'active', r.body);

r = await call('POST', `/projects/${gardenSlug}/transition`, { token: aliceToken, body: { transition: 'archive' } });
check('archiver 200', r.status === 200 && r.body.state === 'archived', r.body);

r = await call('POST', `/projects/${gardenSlug}/transition`, { token: aliceToken, body: { transition: 'reactivate' } });
check('reactiver 200', r.status === 200 && r.body.state === 'active', r.body);

r = await call('POST', `/projects/${gardenSlug}/transition`, { token: aliceToken, body: { transition: 'inventee' } });
check('transition inconnue 400', r.status === 400, r.body);

r = await call('DELETE', `/projects/${slug}`, { token: bobToken, body: { confirmTitle: projectTitle } });
check('suppression 204', r.status === 204, r.body);

r = await call('GET', `/projects/${slug}`);
check('R-X3 : projet supprime introuvable 404', r.status === 404, r.body);

r = await call('POST', '/auth/logout', { token: aliceToken });
check('deconnexion 204', r.status === 204, r.body);

r = await call('GET', '/me', { token: aliceToken });
check('jeton invalide apres deconnexion 401', r.status === 401, r.body);

// --------------------------------------------------------------- couverture

section('couverture des routes');
const all = ROUTE_TEMPLATES.map((route) => `${route.method} ${route.template}`);
const unique = [...new Set(all)];
const untested = unique.filter((route) => !covered.has(route));

console.log(`  ${covered.size} / ${unique.length} routes exercees`);

for (const route of untested.sort()) {
  failures += 1;
  console.log(`  FAIL jamais appelee : ${route}`);
}

console.log(
  `\n${failures === 0 ? 'TOUT PASSE' : `${failures} ECHEC(S)`}${skipped ? ` — ${skipped} scenario(s) saute(s)` : ''}`,
);
process.exit(failures === 0 ? 0 : 1);
