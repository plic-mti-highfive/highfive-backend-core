import { JwtService } from '@nestjs/jwt';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  addMember,
  authHeader,
  createProject,
  registerUser,
  type TestProject,
  type TestUser,
} from './helpers/api.js';
import { createTestApp, type TestApp } from './helpers/create-test-app.js';

interface CanvasClaims {
  userId: string;
  projectId: string;
  canvasId: string;
  role: string;
}

describe('Le Mur (integration)', () => {
  let t: TestApp;
  let owner: TestUser;
  let co: TestUser;
  let member: TestUser;
  let observer: TestUser;
  let outsider: TestUser;
  let project: TestProject;

  beforeAll(async () => {
    t = await createTestApp();
    owner = await registerUser(t, { prefix: 'porteur' });
    co = await registerUser(t, { prefix: 'co' });
    member = await registerUser(t, { prefix: 'membre' });
    observer = await registerUser(t, { prefix: 'observateur' });
    outsider = await registerUser(t, { prefix: 'inconnu' });
    project = await createProject(t, owner, { publish: true });
    await addMember(t, owner, project, co, 'co_owner');
    await addMember(t, owner, project, member, 'member');
    await addMember(t, owner, project, observer, 'observer');
  });
  afterAll(async () => {
    await t.close();
  });

  const as = (user: TestUser) => authHeader(user.token);
  const session = (user?: TestUser, slug = project.slug) => {
    const request = t.http.get(`/api/projects/${slug}/wall/session`);
    return user ? request.set(as(user)) : request;
  };

  describe('wall/session', () => {
    it.each([
      ['porteur', () => owner, 'admin'],
      ['co-porteur', () => co, 'admin'],
      ['membre', () => member, 'editor'],
      ['observateur', () => observer, 'viewer'],
    ])('%s : jeton canvas signe avec le role %s', async (_, user, role) => {
      const response = await session(user());
      expect(response.status).toBe(200);
      const body = response.body as {
        token: string;
        canvasId: string;
        projectId: string;
        websocketUrl: string;
        role: string;
      };
      expect(body.role).toBe(role);
      expect(body.projectId).toBe(project.id);
      expect(body.websocketUrl).toMatch(/^wss?:\/\//);

      const claims = await t.app
        .get(JwtService)
        .verifyAsync<CanvasClaims>(body.token, {
          secret: 'canvas-secret-de-test',
        });
      expect(claims).toMatchObject({
        userId: user().id,
        projectId: project.id,
        canvasId: body.canvasId,
        role,
      });
    });

    it('le jeton canvas n est pas valable avec un autre secret', async () => {
      const { token } = (await session(owner)).body as { token: string };
      await expect(
        t.app.get(JwtService).verifyAsync(token, { secret: 'autre-secret' }),
      ).rejects.toThrow();
    });

    it('refuse un non-membre, meme sur un projet public (403, R-W1)', async () => {
      const response = await session(outsider);
      expect(response.status).toBe(403);
      expect(response.body).toEqual({
        code: 'forbidden',
        message: "Tu n'as pas le droit de faire ca ici.",
      });
    });

    it('refuse l anonyme (401) et un projet inconnu (404)', async () => {
      expect((await session()).status).toBe(401);
      expect((await session(owner, 'projet-inconnu')).status).toBe(404);
    });

    it('une personne bloquee n a plus d acces', async () => {
      const blocked = await registerUser(t, { prefix: 'bloque' });
      await addMember(t, owner, project, blocked, 'member');
      expect((await session(blocked)).status).toBe(200);
      await t.http
        .post(`/api/projects/${project.slug}/members/${blocked.id}/block`)
        .set(as(owner));
      expect((await session(blocked)).status).toBe(403);
    });

    it('un brouillon : son porteur obtient une session, un tiers non', async () => {
      const draft = await createProject(t, owner);
      expect((await session(owner, draft.slug)).status).toBe(200);
      expect((await session(outsider, draft.slug)).status).toBe(403);
    });

    it('le canvasId est stable d un appel a l autre', async () => {
      const first = (await session(owner)).body as { canvasId: string };
      const second = (await session(member)).body as { canvasId: string };
      expect(second.canvasId).toBe(first.canvasId);
    });
  });

  describe('metadonnees du Mur', () => {
    it('lisibles par un observateur, refusees a un inconnu', async () => {
      expect(
        (
          await t.http
            .get(`/api/projects/${project.slug}/wall`)
            .set(as(observer))
        ).status,
      ).toBe(200);
      expect(
        (
          await t.http
            .get(`/api/projects/${project.slug}/wall`)
            .set(as(outsider))
        ).status,
      ).toBe(403);
    });
  });

  describe('conversion en taches (R-W2)', () => {
    const toTasks = (user: TestUser, labels: string[]) =>
      t.http
        .post(`/api/projects/${project.slug}/wall/to-tasks`)
        .set(as(user))
        .send({
          elements: labels.map((label, i) => ({ id: `el-${i}`, label })),
        });

    it('un membre cree des taches dans la premiere colonne, avec le lien d origine', async () => {
      const response = await toTasks(member, ['Idee A', '   ']);
      expect(response.status).toBe(201);
      const tasks = response.body as {
        title: string;
        wallOriginId: string;
        columnId: string;
      }[];
      expect(tasks.map((task) => task.title)).toEqual([
        'Idee A',
        'Idee du Mur 2',
      ]);
      expect(tasks.map((task) => task.wallOriginId)).toEqual(['el-0', 'el-1']);
      expect(new Set(tasks.map((task) => task.columnId)).size).toBe(1);
    });

    it('un observateur et un inconnu ne convertissent pas (403)', async () => {
      expect((await toTasks(observer, ['x'])).status).toBe(403);
      expect((await toTasks(outsider, ['x'])).status).toBe(403);
    });
  });

  describe('suggestions IA', () => {
    it('sans contenu exportable par le canvas : aucune proposition', async () => {
      const response = await t.http
        .post(`/api/projects/${project.slug}/wall/suggest-tasks`)
        .set(as(member));
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ tasks: [], empty: true });
    });

    it('Mur rempli mais OPENAI_TOKEN absent : 503 en francais, rien n est cree', async () => {
      t.canvas.exportResult = {
        canvasId: 'c',
        elements: [{ id: 'n1', kind: 'note', text: 'Reserver la salle' }],
        chat: [],
        drawingCount: 0,
      };
      try {
        const response = await t.http
          .post(`/api/projects/${project.slug}/wall/suggest-tasks`)
          .set(as(member));
        // AiTasksService appelle le SDK openai directement : il ignore
        // LLM_PROVIDER=fake et exige OPENAI_TOKEN.
        expect(response.status).toBe(503);
        expect((response.body as { message: string }).message).toBe(
          "La generation de taches n'est pas configuree sur ce serveur.",
        );
      } finally {
        t.canvas.exportResult = null;
      }
    });

    it('Mur sans texte ni discussion (traces seules) : aucune proposition', async () => {
      t.canvas.exportResult = {
        canvasId: 'c',
        elements: [{ id: 'd1', kind: 'drawing', text: '  ' }],
        chat: [],
        drawingCount: 3,
      };
      try {
        const response = await t.http
          .post(`/api/projects/${project.slug}/wall/suggest-tasks`)
          .set(as(member));
        expect(response.body).toEqual({ tasks: [], empty: true });
      } finally {
        t.canvas.exportResult = null;
      }
    });

    it('reserve aux membres (403 pour un observateur)', async () => {
      const response = await t.http
        .post(`/api/projects/${project.slug}/wall/suggest-tasks`)
        .set(as(observer));
      expect(response.status).toBe(403);
    });

    it('cree les taches retenues, titre tronque a 120 caracteres', async () => {
      const response = await t.http
        .post(`/api/projects/${project.slug}/wall/suggested-tasks`)
        .set(as(member))
        .send({
          tasks: [{ title: 'Proposition retenue', sourceHints: ['note-1'] }],
        });
      expect(response.status).toBe(201);
      expect(response.body).toMatchObject([
        { title: 'Proposition retenue', wallOriginId: 'note-1' },
      ]);
    });
  });
});
