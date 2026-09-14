#!/usr/bin/env node
/**
 * Jeu de demonstration, aligne sur celui du front (`src/mocks/data/` du depot
 * `highfive-frontend`) : memes personnes, memes projets, meme compte de
 * demonstration `alex.rivera@example.com` / `demo1234`.
 *
 * Le seed passe par l'API publique, pas par la base : ce qu'il produit est
 * donc exactement ce qu'un usage normal produirait, regles metier comprises.
 *
 * Usage : node scripts/seed.mjs   (API demarree, base vide de preference)
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
    throw new Error(
      `${method} ${path} -> ${response.status} ${JSON.stringify(payload)}`,
    );
  }
  return payload;
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

console.log(`Seed sur ${API}`);

for (const person of PEOPLE) {
  const session = await ensureAccount(person);
  sessions.set(person.username, session.token);
  await call('PATCH', '/me', {
    token: session.token,
    body: { bio: person.bio, interests: person.interests },
  });
  console.log(`  personne ${person.username}`);
}

const slugs = [];

for (const project of PROJECTS) {
  const token = sessions.get(project.owner);
  const created = await call('POST', '/projects', {
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
    slugs.push(created.slug);
  }
  console.log(`  projet ${created.slug}${project.publish ? '' : ' (brouillon)'}`);
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

console.log('\nTermine.');
console.log(`Compte de demonstration : alex.rivera@example.com / ${PASSWORD}`);
