#!/usr/bin/env node
// Seed script: create EPITA tenant, ~30 users, ~10 projects with members & tickets.
// Usage: node scripts/seed.mjs  (requires backend running at API_URL)

const API_URL = process.env.API_URL ?? 'http://localhost:3000';
const TENANT_NAME = 'EPITA';
const TENANT_DOMAIN = 'epita.highfive.app';
const USER_COUNT = 30;
const PROJECT_COUNT = 10;
const PASSWORD = 'SecureP@ss123';

const FIRST_NAMES = [
  'alice', 'baptiste', 'clement', 'diane', 'elise', 'felix', 'gabriel', 'helene',
  'ines', 'jules', 'karim', 'louise', 'marine', 'nathan', 'olivia', 'paul',
  'quentin', 'remi', 'sarah', 'theo', 'ugo', 'valentine', 'william', 'xavier',
  'yasmine', 'zoe', 'adrien', 'beatrice', 'clara', 'david',
];

const PROJECT_IDEAS = [
  { name: 'Campus Flow', description: 'Gestion du flux étudiant intra-campus' },
  { name: 'Mentor Match', description: 'Matching mentors/mentorés par affinités' },
  { name: 'Canteen Queue', description: 'File d\'attente cafétéria en temps réel' },
  { name: 'Study Rooms', description: 'Réservation de salles de travail' },
  { name: 'Ride Share EPITA', description: 'Covoiturage étudiant' },
  { name: 'Dev Portfolio', description: 'Plateforme portfolio dev' },
  { name: 'Hackathon Tracker', description: 'Suivi des hackathons EPITA' },
  { name: 'Library Bot', description: 'Assistant bibliothèque' },
  { name: 'Alumni Network', description: 'Réseau anciens élèves' },
  { name: 'Course Feedback', description: 'Retours anonymes sur les cours' },
];

const TICKET_TITLES = [
  'Setup CI/CD pipeline',
  'Design authentication flow',
  'Implement user dashboard',
  'Write API documentation',
  'Add unit tests for core module',
  'Fix responsive layout on mobile',
  'Integrate payment gateway',
  'Performance profiling',
];

const PROJECT_ROLES = ['OWNER', 'ADMIN', 'MEMBER', 'VIEWER'];

async function request(path, { method = 'GET', body, headers = {} } = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status} ${text}`);
  }
  return json;
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function sampleWithout(arr, exclude, count) {
  const pool = arr.filter((x) => !exclude.includes(x));
  const out = [];
  while (out.length < count && pool.length) {
    const idx = Math.floor(Math.random() * pool.length);
    out.push(pool.splice(idx, 1)[0]);
  }
  return out;
}

async function ensureTenant() {
  const tenants = await request('/tenants');
  const existing = tenants.find((t) => t.domain === TENANT_DOMAIN);
  if (existing) {
    console.log(`✓ Tenant already exists: ${existing.id}`);
    return existing.id;
  }
  const created = await request('/tenants', {
    method: 'POST',
    body: { name: TENANT_NAME, domain: TENANT_DOMAIN },
  });
  console.log(`✓ Tenant created: ${created.id}`);
  return created.id;
}

async function registerUser(tenantId, email) {
  try {
    const auth = await request('/auth/register', {
      method: 'POST',
      body: { email, password: PASSWORD },
      headers: { 'X-Tenant-ID': tenantId },
    });
    return auth.accessToken;
  } catch (err) {
    if (String(err).includes('409') || String(err).toLowerCase().includes('already')) {
      const auth = await request('/auth/login', {
        method: 'POST',
        body: { email, password: PASSWORD },
        headers: { 'X-Tenant-ID': tenantId },
      });
      return auth.accessToken;
    }
    throw err;
  }
}

function decodeSub(accessToken) {
  const [, payload] = accessToken.split('.');
  const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  return decoded.sub;
}

async function seed() {
  console.log(`→ Seeding ${API_URL}`);
  const tenantId = await ensureTenant();

  const users = [];
  for (let i = 0; i < USER_COUNT; i++) {
    const first = FIRST_NAMES[i % FIRST_NAMES.length];
    const email = `${first}${String(i + 1).padStart(2, '0')}@epita.fr`;
    const accessToken = await registerUser(tenantId, email);
    const id = decodeSub(accessToken);
    users.push({ id, email, accessToken });
    process.stdout.write(`\r  users: ${i + 1}/${USER_COUNT}`);
  }
  console.log('\n✓ Users ready');

  const projects = [];
  for (let i = 0; i < PROJECT_COUNT; i++) {
    const idea = PROJECT_IDEAS[i % PROJECT_IDEAS.length];
    const owner = users[i % users.length];
    const visibility = pickRandom(['PUBLIC', 'PRIVATE', 'INVITATION_ONLY']);
    const project = await request('/projects', {
      method: 'POST',
      body: { name: idea.name, description: idea.description, visibility },
      headers: {
        'X-Tenant-ID': tenantId,
        Authorization: `Bearer ${owner.accessToken}`,
      },
    });
    projects.push({ ...project, owner });

    const memberCount = 3 + Math.floor(Math.random() * 4);
    const members = sampleWithout(users, [owner], memberCount);
    for (const m of members) {
      await request(`/projects/${project.id}/members`, {
        method: 'POST',
        body: { userId: m.id, role: pickRandom(['ADMIN', 'MEMBER', 'MEMBER', 'VIEWER']) },
        headers: {
          'X-Tenant-ID': tenantId,
          Authorization: `Bearer ${owner.accessToken}`,
        },
      });
    }

    const ticketCount = 2 + Math.floor(Math.random() * 4);
    for (let t = 0; t < ticketCount; t++) {
      const assignee = pickRandom([owner, ...members]);
      await request(`/projects/${project.id}/tickets`, {
        method: 'POST',
        body: {
          title: pickRandom(TICKET_TITLES),
          description: `Ticket #${t + 1} pour ${idea.name}`,
          assigneeId: assignee.id,
        },
        headers: {
          'X-Tenant-ID': tenantId,
          Authorization: `Bearer ${owner.accessToken}`,
        },
      });
    }
    process.stdout.write(`\r  projects: ${i + 1}/${PROJECT_COUNT}`);
  }
  console.log('\n✓ Projects ready');

  console.log(`\nDone. Tenant ${tenantId} — ${users.length} users, ${projects.length} projects.`);
}

seed().catch((err) => {
  console.error('\n✗ Seed failed:', err.message);
  process.exit(1);
});
