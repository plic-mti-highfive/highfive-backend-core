import type request from 'supertest';
import { randomBytes } from 'node:crypto';
import { TAGS } from '../../../src/contracts/index.js';
import { ADMIN_EMAIL, TEST_PASSWORD, type TestApp } from './create-test-app.js';

export interface TestUser {
  id: string;
  username: string;
  email: string;
  token: string;
}

export const authHeader = (token: string): { Authorization: string } => ({
  Authorization: `Bearer ${token}`,
});

const unique = (): string => randomBytes(4).toString('hex');

/** Inscrit une personne via l'API ; `admin` utilise l'adresse de ADMIN_EMAILS. */
export async function registerUser(
  t: TestApp,
  options: { admin?: boolean; prefix?: string } = {},
): Promise<TestUser> {
  const username = `${options.prefix ?? 'user'}-${unique()}`;
  const email = options.admin ? ADMIN_EMAIL : `${username}@highfive.test`;
  const response = await t.http
    .post('/api/auth/register')
    .send({ email, password: TEST_PASSWORD, username });
  if (response.status !== 201) {
    throw new Error(
      `Inscription impossible : ${JSON.stringify(response.body)}`,
    );
  }
  const body = response.body as { user: { id: string }; token: string };
  return { id: body.user.id, username, email, token: body.token };
}

export function login(
  t: TestApp,
  email: string,
  password: string = TEST_PASSWORD,
): request.Test {
  return t.http.post('/api/auth/login').send({ email, password });
}

export interface ProjectInput {
  title?: string;
  tagline?: string;
  tags?: string[];
  visibility?: 'public' | 'private';
  participation?: 'open' | 'on_request' | 'on_invite';
}

export interface TestProject {
  id: string;
  slug: string;
}

/** Cree un projet (brouillon) ; `publish: true` le passe ensuite en `active`. */
export async function createProject(
  t: TestApp,
  owner: TestUser,
  input: ProjectInput & { publish?: boolean } = {},
): Promise<TestProject> {
  const { publish, ...rest } = input;
  const response = await t.http
    .post('/api/projects')
    .set(authHeader(owner.token))
    .send({
      title: `Projet de test ${unique()}`,
      tagline: 'Une accroche',
      tags: [TAGS[0].id],
      visibility: 'public',
      participation: 'on_request',
      ...rest,
    });
  if (response.status !== 201) {
    throw new Error(`Projet impossible : ${JSON.stringify(response.body)}`);
  }
  const project = response.body as TestProject;
  if (publish) {
    const published = await t.http
      .post(`/api/projects/${project.slug}/transition`)
      .set(authHeader(owner.token))
      .send({ transition: 'publish' });
    if (published.status !== 200) {
      throw new Error(
        `Publication impossible : ${JSON.stringify(published.body)}`,
      );
    }
  }
  return { id: project.id, slug: project.slug };
}

/** Ajoute `user` a l'equipe par invitation acceptee, avec le role voulu. */
export async function addMember(
  t: TestApp,
  owner: TestUser,
  project: TestProject,
  user: TestUser,
  role: 'co_owner' | 'member' | 'observer' = 'member',
): Promise<void> {
  const invitation = await t.http
    .post(`/api/projects/${project.slug}/invitations`)
    .set(authHeader(owner.token))
    .send({ recipientId: user.id, proposedRole: role });
  if (invitation.status !== 201) {
    throw new Error(
      `Invitation impossible : ${JSON.stringify(invitation.body)}`,
    );
  }
  const accepted = await t.http
    .post(`/api/invitations/${(invitation.body as { id: string }).id}/accept`)
    .set(authHeader(user.token));
  if (accepted.status !== 204) {
    throw new Error(
      `Acceptation impossible : ${JSON.stringify(accepted.body)}`,
    );
  }
}

export async function firstColumnId(
  t: TestApp,
  owner: TestUser,
  project: TestProject,
): Promise<string> {
  const response = await t.http
    .get(`/api/projects/${project.slug}/columns`)
    .set(authHeader(owner.token));
  return (response.body as { id: string }[])[0].id;
}
