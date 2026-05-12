import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as argon2 from 'argon2';
// Inline enums — avoid ESM-only shared-types package at seed time
const UserStatus = { ACTIVE: 'ACTIVE', PENDING: 'PENDING', SUSPENDED: 'SUSPENDED' } as const;
const ProjectStatus = { DRAFT: 'DRAFT', ACTIVE: 'ACTIVE', ARCHIVED: 'ARCHIVED' } as const;
const ProjectVisibility = { PUBLIC: 'PUBLIC', PRIVATE: 'PRIVATE', INVITATION_ONLY: 'INVITATION_ONLY' } as const;
const ProjectRole = { OWNER: 'OWNER', ADMIN: 'ADMIN', MEMBER: 'MEMBER', VIEWER: 'VIEWER' } as const;
const TicketStatus = { TODO: 'TODO', IN_PROGRESS: 'IN_PROGRESS', IN_REVIEW: 'IN_REVIEW', DONE: 'DONE' } as const;

// ─── Entities ─────────────────────────────────────────────────────────────────

import { Tenant } from '../identity/tenants/entities/tenant.entity.js';
import { User } from '../identity/users/entities/user.entity.js';
import { UserProfile } from '../identity/user-profiles/entities/user-profile.entity.js';
import { Project } from '../project-execution/projects/entities/project.entity.js';
import { ProjectMember } from '../project-execution/project-members/entities/project-member.entity.js';
import { Ticket } from '../project-execution/tickets/entities/ticket.entity.js';
import { ProjectMessage } from '../project-execution/project-messages/entities/project-message.entity.js';
import { RefreshToken } from '../identity/auth/entities/refresh-token.entity.js';
import { Skill } from '../identity/skills/entities/skill.entity.js';
import { UserSkill } from '../identity/skills/entities/user-skill.entity.js';
import { UserConnection } from '../identity/user-connections/entities/user-connection.entity.js';
import { ProjectFollower } from '../project-execution/project-members/entities/project-follower.entity.js';

// ─── Seed data ────────────────────────────────────────────────────────────────

const SEED_PASSWORD = 'password123';

const USERS_DATA = [
  { email: 'alice@highfive.dev', bio: 'Développeuse fullstack passionnée par l\'open source et le design system.' },
  { email: 'bob@highfive.dev', bio: 'Ingénieur ML spécialisé en NLP et vision par ordinateur.' },
  { email: 'charlie@highfive.dev', bio: 'Designer UX/UI avec 5 ans d\'expérience en product design.' },
  { email: 'diana@highfive.dev', bio: 'DevOps engineer, fan de Kubernetes et d\'infrastructure as code.' },
  { email: 'eve@highfive.dev', bio: 'Étudiante en informatique, contributrice active à plusieurs projets.' },
];

const PROJECTS_DATA = [
  {
    name: 'EcoTrack',
    description: 'Application mobile pour suivre et réduire son empreinte carbone au quotidien. Notifications intelligentes, défis hebdomadaires et tableau de bord personnalisé.',
    status: ProjectStatus.ACTIVE,
    visibility: ProjectVisibility.PUBLIC,
    tickets: [
      { title: 'Onboarding utilisateur', description: 'Écran de bienvenue avec tutoriel interactif', status: TicketStatus.DONE },
      { title: 'Calcul empreinte carbone', description: 'Algorithme de calcul basé sur les activités saisies', status: TicketStatus.IN_PROGRESS },
      { title: 'Notifications push', description: 'Rappels quotidiens et alertes de dépassement', status: TicketStatus.TODO },
      { title: 'Partage réseaux sociaux', description: 'Partager ses badges et progrès sur les réseaux', status: TicketStatus.TODO },
    ],
  },
  {
    name: 'HealthAI',
    description: 'Assistant IA pour le suivi personnalisé de santé et bien-être. Analyse des données biométriques et recommandations adaptées.',
    status: ProjectStatus.ACTIVE,
    visibility: ProjectVisibility.PUBLIC,
    tickets: [
      { title: 'Intégration API santé', description: 'Connexion avec Apple Health et Google Fit', status: TicketStatus.IN_REVIEW },
      { title: 'Modèle de recommandation', description: 'Modèle ML pour recommandations personnalisées', status: TicketStatus.IN_PROGRESS },
      { title: 'Dashboard métriques', description: 'Visualisation des données de santé sur 30 jours', status: TicketStatus.TODO },
    ],
  },
  {
    name: 'CodeMentor',
    description: 'Plateforme de mentorat pour développeurs débutants. Sessions vidéo, revue de code et suivi de progression.',
    status: ProjectStatus.ACTIVE,
    visibility: ProjectVisibility.PUBLIC,
    tickets: [
      { title: 'Système de matching mentor/mentoré', description: 'Algorithme de mise en relation par compétences', status: TicketStatus.DONE },
      { title: 'Intégration vidéo call', description: 'Sessions vidéo via WebRTC', status: TicketStatus.IN_PROGRESS },
      { title: 'Revue de code inline', description: 'Commentaires directement sur les fichiers', status: TicketStatus.TODO },
      { title: 'Badges et certifications', description: 'Système de récompenses pour les mentorés', status: TicketStatus.TODO },
    ],
  },
  {
    name: 'MusicFlow',
    description: 'Éditeur de musique collaboratif en temps réel. Composez, mixez et partagez avec votre équipe simultanément.',
    status: ProjectStatus.ACTIVE,
    visibility: ProjectVisibility.PUBLIC,
    tickets: [
      { title: 'Éditeur de piste audio', description: 'Interface drag & drop pour arranger les pistes', status: TicketStatus.IN_PROGRESS },
      { title: 'Collaboration temps réel', description: 'Synchronisation via WebSocket', status: TicketStatus.TODO },
      { title: 'Export MP3/WAV', description: 'Rendu et téléchargement du projet musical', status: TicketStatus.TODO },
    ],
  },
  {
    name: 'DataViz Pro',
    description: 'Outil de visualisation de données interactives. Connectez vos sources, créez des dashboards et partagez en un clic.',
    status: ProjectStatus.DRAFT,
    visibility: ProjectVisibility.PRIVATE,
    tickets: [
      { title: 'Connexion sources de données', description: 'Support CSV, JSON, PostgreSQL et REST API', status: TicketStatus.TODO },
      { title: 'Éditeur de graphiques', description: 'Bar, line, pie, scatter — avec thèmes', status: TicketStatus.TODO },
    ],
  },
  {
    name: 'SecureChain',
    description: 'Solution blockchain pour la traçabilité alimentaire. De la ferme à la table, chaque étape certifiée.',
    status: ProjectStatus.ACTIVE,
    visibility: ProjectVisibility.PUBLIC,
    tickets: [
      { title: 'Smart contract traçabilité', description: 'Contrat Solidity pour enregistrer les étapes', status: TicketStatus.DONE },
      { title: 'Scanner QR produits', description: 'Application mobile pour scanner et vérifier', status: TicketStatus.IN_REVIEW },
      { title: 'Tableau de bord producteur', description: 'Interface web pour les agriculteurs', status: TicketStatus.IN_PROGRESS },
    ],
  },
];

// ─── Main ─────────────────────────────────────────────────────────────────────

async function seed() {
  process.stdout.write('\n🌱 Starting seed...\n\n');

  const ds = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    username: process.env.DB_USERNAME ?? 'highfive',
    password: process.env.DB_PASSWORD ?? 'secret',
    database: process.env.DB_DATABASE ?? 'highfive_dev',
    entities: [
      Tenant, User, UserProfile, RefreshToken,
      Skill, UserSkill, UserConnection,
      Project, ProjectMember, ProjectFollower,
      Ticket, ProjectMessage,
    ],
    synchronize: false,
  });

  await ds.initialize();

  const tenantRepo = ds.getRepository(Tenant);
  const userRepo = ds.getRepository(User);
  const profileRepo = ds.getRepository(UserProfile);
  const projectRepo = ds.getRepository(Project);
  const memberRepo = ds.getRepository(ProjectMember);
  const ticketRepo = ds.getRepository(Ticket);
  const messageRepo = ds.getRepository(ProjectMessage);

  // ── 1. Tenant ──────────────────────────────────────────────────────────────

  let tenant: Tenant;
  const envTenantId = process.env.VITE_TENANT_ID;

  if (envTenantId) {
    const found = await tenantRepo.findOne({ where: { id: envTenantId } });
    if (!found) throw new Error(`Tenant ${envTenantId} not found. Run the app first to create it.`);
    tenant = found;
    process.stdout.write(`  ✔ Tenant: ${tenant.name} (${tenant.id})\n`);
  } else {
    const existing = await tenantRepo.find({ take: 1 });
    if (existing.length > 0) {
      tenant = existing[0];
      process.stdout.write(`  ✔ Tenant: ${tenant.name} (${tenant.id})\n`);
    } else {
      tenant = tenantRepo.create({ name: 'HighFive School', domain: 'highfive.dev' });
      await tenantRepo.save(tenant);
      process.stdout.write(`  ✔ Tenant créé: ${tenant.name} (${tenant.id})\n`);
      process.stdout.write(`\n  ⚠️  Ajoutez ceci à votre .env frontend:\n  VITE_TENANT_ID=${tenant.id}\n\n`);
    }
  }

  const tenantId = tenant.id;

  // ── 2. Users ───────────────────────────────────────────────────────────────

  process.stdout.write('\n👤 Users\n');
  const passwordHash = await argon2.hash(SEED_PASSWORD);
  const users: User[] = [];

  for (const data of USERS_DATA) {
    const existing = await userRepo.findOne({ where: { email: data.email } });
    if (existing) {
      process.stdout.write(`  skip  ${data.email}\n`);
      users.push(existing);
      continue;
    }
    const user = userRepo.create({ tenantId, email: data.email, passwordHash, status: UserStatus.ACTIVE });
    await userRepo.save(user);
    await profileRepo.save(profileRepo.create({ userId: user.id, tenantId, bio: data.bio, avatarPath: null }));
    users.push(user);
    process.stdout.write(`  ✔     ${data.email}\n`);
  }

  // ── 3. Projects + members + tickets + messages ─────────────────────────────

  process.stdout.write('\n📁 Projects\n');

  for (let i = 0; i < PROJECTS_DATA.length; i++) {
    const data = PROJECTS_DATA[i];
    const existing = await projectRepo.findOne({ where: { name: data.name, tenantId } });
    if (existing) {
      process.stdout.write(`  skip  ${data.name}\n`);
      continue;
    }

    const project = await projectRepo.save(
      projectRepo.create({ tenantId, name: data.name, description: data.description, status: data.status, visibility: data.visibility }),
    );

    const owner = users[i % users.length];
    const contributor = users[(i + 1) % users.length];

    await memberRepo.save(memberRepo.create({ projectId: project.id, userId: owner.id, tenantId, role: ProjectRole.OWNER }));
    await memberRepo.save(memberRepo.create({ projectId: project.id, userId: contributor.id, tenantId, role: ProjectRole.MEMBER }));

    for (const t of data.tickets) {
      await ticketRepo.save(ticketRepo.create({
        projectId: project.id, tenantId, title: t.title, description: t.description, status: t.status,
        assigneeId: t.status !== TicketStatus.TODO ? contributor.id : null,
      }));
    }

    for (const content of [`Bienvenue sur ${data.name} !`, 'Premier sprint lancé.']) {
      await messageRepo.save(messageRepo.create({ projectId: project.id, tenantId, authorId: owner.id, content, attachmentPath: null }));
    }

    process.stdout.write(`  ✔     ${data.name} (${data.tickets.length} tickets)\n`);
  }

  await ds.destroy();

  process.stdout.write('\n✅ Seed terminé !\n');
  process.stdout.write(`\n  Connexion avec n\'importe quel user (mot de passe: ${SEED_PASSWORD}):\n`);
  USERS_DATA.forEach(u => process.stdout.write(`    ${u.email}\n`));
  process.stdout.write('\n');
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
