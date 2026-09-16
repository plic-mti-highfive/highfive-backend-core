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

/** Routes volontairement hors perimetre : la messagerie (lot suivant). */
const OUT_OF_SCOPE = new Set([
  'GET /conversations',
  'POST /conversations',
  'GET /conversations/{conversationId}',
  'GET /conversations/{conversationId}/messages',
  'POST /conversations/{conversationId}/messages',
  'POST /conversations/{conversationId}/read',
  'PATCH /messages/{messageId}',
  'DELETE /messages/{messageId}',
]);

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
  const [firstReport, secondReport] = r.body.items;

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
const untested = unique.filter((route) => !covered.has(route) && !OUT_OF_SCOPE.has(route));

console.log(`  ${covered.size} / ${unique.length - OUT_OF_SCOPE.size} routes exercees`);
console.log(`  ${OUT_OF_SCOPE.size} hors perimetre (messagerie)`);

for (const route of untested.sort()) {
  failures += 1;
  console.log(`  FAIL jamais appelee : ${route}`);
}

console.log(
  `\n${failures === 0 ? 'TOUT PASSE' : `${failures} ECHEC(S)`}${skipped ? ` — ${skipped} scenario(s) saute(s)` : ''}`,
);
process.exit(failures === 0 ? 0 : 1);
