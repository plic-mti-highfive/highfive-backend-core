#!/usr/bin/env node
/**
 * Jeu de demonstration, aligne sur celui du front (`src/mocks/data/` du depot
 * `highfive-frontend`) : memes personnes, memes projets, meme compte de
 * demonstration `alex.rivera@example.com` / `demo1234`.
 *
 * Le seed passe par l'API publique, pas par la base : ce qu'il produit est
 * donc exactement ce qu'un usage normal produirait, regles metier comprises.
 *
 * Idempotent : relance sans effet sur une base deja seedee (l'infra le
 * relance a chaque `docker compose up`, cf. highfive-infra/docker-compose.dev.yml).
 * Les comptes retombent sur la connexion s'ils existent deja ; les projets
 * sont retrouves par leur slug avant creation.
 *
 * Usage : node scripts/seed.mjs   (API demarree, base vide ou deja seedee)
 */

const API = (process.env.API_URL ?? 'http://localhost:3000') + '/api';
const PASSWORD = 'demo1234';

async function call(method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(API + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : undefined;

  if (!response.ok) {
    const error = new Error(
      `${method} ${path} -> ${response.status} ${JSON.stringify(payload)}`,
    );
    error.status = response.status;
    throw error;
  }
  return payload;
}

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

/** Ré-inscrire une personne deja presente echoue : on retombe sur la connexion. */
async function ensureAccount(person) {
  try {
    return await call('POST', '/auth/register', {
      body: {
        email: person.email,
        password: PASSWORD,
        username: person.username,
        displayName: person.displayName,
      },
    });
  } catch {
    return call('POST', '/auth/login', {
      body: { email: person.email, password: PASSWORD },
    });
  }
}

const PEOPLE = [
  { username: 'alex.rivera', displayName: 'Alex Rivera', email: 'alex.rivera@example.com', bio: 'Fresques, murs et peinture qui deborde.', interests: ['dessin', 'quartier'] },
  { username: 'marc.leroy', displayName: 'Marc Leroy', email: 'marc.leroy@example.com', bio: 'Bricoleur du dimanche, soudeur le samedi.', interests: ['bricolage', 'reparation'] },
  { username: 'sophie.b', displayName: 'Sophie Bernard', email: 'sophie.b@example.com', bio: 'Jardin partage et compost collectif.', interests: ['jardinage', 'environnement'] },
  { username: 'yanis.f', displayName: 'Yanis Fournier', email: 'yanis.f@example.com', bio: 'Je code des petits jeux le soir.', interests: ['code', 'jeu-video'] },
  { username: 'lea.m', displayName: 'Lea Moreau', email: 'lea.m@example.com', bio: 'Cuisine de quartier, sans chichis.', interests: ['cuisine', 'solidarite'] },
];

const PROJECTS = [
  {
    owner: 'alex.rivera',
    title: 'Fresque murale collaborative',
    tagline: 'Repeindre le mur du gymnase avec le quartier',
    description: "Un mur gris de trente metres, un quartier qui passe devant tous les jours. On veut le couvrir de couleurs, ensemble, un samedi par mois.",
    tags: ['dessin', 'quartier'],
    needs: [{ label: 'Peintres amateurs' }, { label: 'Pret d un echafaudage' }],
    publish: true,
  },
  {
    owner: 'sophie.b',
    title: 'Jardin partage des Lilas',
    tagline: 'Transformer la friche en potager de quartier',
    description: "Deux cents metres carres de friche derriere l ecole. On defriche, on plante, on partage la recolte.",
    tags: ['jardinage', 'environnement'],
    needs: [{ label: 'Outils de jardinage' }],
    publish: true,
  },
  {
    owner: 'marc.leroy',
    title: 'Repair cafe mensuel',
    tagline: 'Reparer ensemble plutot que jeter',
    description: "Un samedi par mois, on ouvre l atelier : grille-pain, velos, lampes. On repare, et surtout on montre comment faire.",
    tags: ['reparation', 'solidarite'],
    needs: [{ label: 'Electronicien bienveillant' }],
    publish: true,
  },
  {
    owner: 'lea.m',
    title: 'Distribution de soupe',
    tagline: 'Une soupe chaude devant la gare, tous les jeudis',
    description: "On cuisine l apres-midi, on distribue le soir. Il faut des bras, des marmites et de la bonne humeur.",
    tags: ['cuisine', 'solidarite'],
    needs: [{ label: 'Conducteur avec un vehicule' }],
    publish: true,
  },
  {
    owner: 'yanis.f',
    title: 'Petit jeu du quartier',
    tagline: 'Un jeu video qui se passe dans nos rues',
    description: "Une carte du quartier, des personnages inspires des gens d ici. Encore au stade des idees.",
    tags: ['jeu-video', 'code'],
    needs: [{ label: 'Quelqu un qui dessine' }],
    publish: false,
  },
];

const sessions = new Map();
const userIds = new Map();

console.log(`Seed sur ${API}`);

for (const person of PEOPLE) {
  const session = await ensureAccount(person);
  sessions.set(person.username, session.token);
  userIds.set(person.username, session.user.id);
  await call('PATCH', '/me', {
    token: session.token,
    body: { bio: person.bio, interests: person.interests },
  });
  console.log(`  personne ${person.username}`);
}

const slugs = [];

for (const project of PROJECTS) {
  const token = sessions.get(project.owner);
  const slug = slugify(project.title);

  let created;
  try {
    created = await call('GET', `/projects/${slug}`, { token });
    console.log(`  projet ${created.slug} (deja present)`);
  } catch (err) {
    if (err.status !== 404) throw err;

    created = await call('POST', '/projects', {
      token,
      body: {
        title: project.title,
        tagline: project.tagline,
        description: project.description,
        tags: project.tags,
        needs: project.needs,
        visibility: 'public',
        participation: 'open',
      },
    });

    if (project.publish) {
      await call('POST', `/projects/${created.slug}/transition`, {
        token,
        body: { transition: 'publish' },
      });
    }
    console.log(`  projet ${created.slug}${project.publish ? '' : ' (brouillon)'}`);
  }

  if (project.publish) slugs.push(created.slug);
}

// Un peu de vie : des highfives croises et quelques equipes reelles, pour que
// les fils et les compteurs ne soient pas tous a zero.
for (const slug of slugs) {
  for (const [username, token] of sessions) {
    try {
      await call('POST', `/projects/${slug}/highfive`, { token });
    } catch {
      // Le porteur ne highfive pas son projet (R-H2) : c'est attendu.
      void username;
    }
  }
}

for (const slug of slugs.slice(0, 3)) {
  for (const username of ['marc.leroy', 'lea.m']) {
    try {
      await call('POST', `/projects/${slug}/join-requests`, {
        token: sessions.get(username),
        body: { message: 'Je veux bien donner un coup de main.' },
      });
    } catch {
      // Deja membre, ou porteur du projet.
    }
  }
}

// Messagerie : alignee sur src/mocks/data/conversations.ts du front, avec les
// personnes de ce jeu. Chaque conversation n'est ecrite que si elle manque :
// une conversation directe se reprend (R-MSG1), et relancer le seed ajouterait
// sinon les memes messages a chaque demarrage.
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
  if (existing) {
    console.log(`  conversation ${direct.from} -> ${direct.to} (deja presente)`);
    continue;
  }
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
if ((await conversationsOf(GROUP.creator)).some((c) => c.type === 'group' && c.title === GROUP.title)) {
  console.log(`  groupe ${GROUP.title} (deja present)`);
} else {
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
} else if (canal.lastMessage) {
  console.log(`  canal ${fresqueSlug} (deja anime)`);
} else {
  await call('POST', `/conversations/${canal.id}/messages`, {
    token: sessions.get('marc.leroy'),
    body: { body: 'La peinture est commandee, livraison jeudi.' },
  });
  console.log(`  canal ${fresqueSlug}`);
}

console.log('\nTermine.');
console.log(`Compte de demonstration : alex.rivera@example.com / ${PASSWORD}`);
