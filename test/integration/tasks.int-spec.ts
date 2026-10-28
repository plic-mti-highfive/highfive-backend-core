import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  addMember,
  authHeader,
  createProject,
  firstColumnId,
  registerUser,
  type TestProject,
  type TestUser,
} from './helpers/api.js';
import { createTestApp, type TestApp } from './helpers/create-test-app.js';

describe('Taches et colonnes (integration)', () => {
  let t: TestApp;
  let owner: TestUser;
  let member: TestUser;
  let observer: TestUser;
  let outsider: TestUser;
  let project: TestProject;
  let columnId: string;

  beforeAll(async () => {
    t = await createTestApp();
    owner = await registerUser(t, { prefix: 'porteur' });
    member = await registerUser(t, { prefix: 'membre' });
    observer = await registerUser(t, { prefix: 'observateur' });
    outsider = await registerUser(t, { prefix: 'inconnu' });
    project = await createProject(t, owner, { publish: true });
    await addMember(t, owner, project, member, 'member');
    await addMember(t, owner, project, observer, 'observer');
    columnId = await firstColumnId(t, owner, project);
  });
  afterAll(async () => {
    await t.close();
  });

  const as = (user: TestUser) => authHeader(user.token);
  const create = (
    user: TestUser | undefined,
    body: Record<string, unknown>,
  ) => {
    const request = t.http.post('/api/tasks');
    return (user ? request.set(as(user)) : request).send({
      columnId,
      title: 'Une tache',
      ...body,
    });
  };

  describe('creation et droits', () => {
    it('un membre cree une tache (seul le titre est obligatoire)', async () => {
      const response = await create(member, {});
      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        columnId,
        title: 'Une tache',
        createdBy: member.id,
        assigneeIds: [],
      });
    });

    it('le porteur aussi ; observateur, inconnu et anonyme sont refuses (403/403/401)', async () => {
      expect((await create(owner, {})).status).toBe(201);
      expect((await create(observer, {})).status).toBe(403);
      expect((await create(outsider, {})).status).toBe(403);
      expect((await create(undefined, {})).status).toBe(401);
    });

    it('titre vide ou colonne inexistante : 400 / 404', async () => {
      expect((await create(member, { title: '' })).status).toBe(400);
      const missing = await create(member, { columnId: randomUUID() });
      expect(missing.status).toBe(404);
      expect((missing.body as { message: string }).message).toBe(
        "Cette colonne n'existe pas.",
      );
    });
  });

  describe('assignation (R-K5)', () => {
    it('assigne un membre de l equipe', async () => {
      const response = await create(owner, { assigneeIds: [member.id] });
      expect(response.status).toBe(201);
      expect((response.body as { assigneeIds: string[] }).assigneeIds).toEqual([
        member.id,
      ]);
    });

    it('refuse un non-membre (400, message FR) et ne cree rien', async () => {
      const before = await t.http
        .get(`/api/projects/${project.slug}/tasks`)
        .set(as(owner));
      const response = await create(owner, { assigneeIds: [outsider.id] });
      expect(response.status).toBe(400);
      expect((response.body as { message: string }).message).toBe(
        "On ne peut assigner une tache qu'aux personnes de l'equipe.",
      );
      const after = await t.http
        .get(`/api/projects/${project.slug}/tasks`)
        .set(as(owner));
      expect((after.body as unknown[]).length).toBe(
        (before.body as unknown[]).length,
      );
    });

    it('refuse une personne bloquee sur le projet', async () => {
      const blocked = await registerUser(t, { prefix: 'bloque' });
      await addMember(t, owner, project, blocked, 'member');
      await t.http
        .post(`/api/projects/${project.slug}/members/${blocked.id}/block`)
        .set(as(owner));
      expect((await create(owner, { assigneeIds: [blocked.id] })).status).toBe(
        400,
      );
    });

    it('la mise a jour revalide aussi l assignation', async () => {
      const task = (await create(owner, {})).body as { id: string };
      const bad = await t.http
        .patch(`/api/tasks/${task.id}`)
        .set(as(owner))
        .send({ assigneeIds: [outsider.id] });
      expect(bad.status).toBe(400);
      const ok = await t.http
        .patch(`/api/tasks/${task.id}`)
        .set(as(owner))
        .send({ assigneeIds: [member.id] });
      expect(ok.status).toBe(200);
      expect((ok.body as { assigneeIds: string[] }).assigneeIds).toEqual([
        member.id,
      ]);
    });
  });

  describe('modification, deplacement, suppression', () => {
    it('met a jour titre et echeance, et retire l echeance avec null', async () => {
      const task = (await create(member, { dueDate: '2030-01-15' })).body as {
        id: string;
        dueDate: string;
      };
      expect(task.dueDate).toBe('2030-01-15');
      const renamed = await t.http
        .patch(`/api/tasks/${task.id}`)
        .set(as(member))
        .send({ title: 'Renommee' });
      expect(renamed.body).toMatchObject({
        title: 'Renommee',
        dueDate: '2030-01-15',
      });
      const cleared = await t.http
        .patch(`/api/tasks/${task.id}`)
        .set(as(member))
        .send({ dueDate: null });
      expect((cleared.body as { dueDate?: string }).dueDate).toBeUndefined();
    });

    it('observateur et inconnu ne modifient, deplacent ni ne suppriment', async () => {
      const task = (await create(member, {})).body as { id: string };
      for (const user of [observer, outsider]) {
        expect(
          (
            await t.http
              .patch(`/api/tasks/${task.id}`)
              .set(as(user))
              .send({ title: 'Non' })
          ).status,
        ).toBe(403);
        expect(
          (
            await t.http
              .post(`/api/tasks/${task.id}/move`)
              .set(as(user))
              .send({ columnId, order: 0 })
          ).status,
        ).toBe(403);
        expect(
          (await t.http.delete(`/api/tasks/${task.id}`).set(as(user))).status,
        ).toBe(403);
      }
      expect((await t.http.delete(`/api/tasks/${task.id}`)).status).toBe(401);
    });

    it('deplace dans une autre colonne et renumerote', async () => {
      const columns = (
        await t.http.get(`/api/projects/${project.slug}/columns`).set(as(owner))
      ).body as {
        id: string;
      }[];
      const target = columns[1].id;
      const task = (await create(member, { title: 'A deplacer' })).body as {
        id: string;
      };
      const moved = await t.http
        .post(`/api/tasks/${task.id}/move`)
        .set(as(member))
        .send({ columnId: target, order: 0 });
      expect(moved.status).toBe(200);
      expect(moved.body).toMatchObject({ columnId: target, order: 0 });
    });

    it('refuse une colonne d un autre projet (400)', async () => {
      const other = await createProject(t, owner);
      const foreign = await firstColumnId(t, owner, other);
      const task = (await create(member, {})).body as { id: string };
      const response = await t.http
        .post(`/api/tasks/${task.id}/move`)
        .set(as(owner))
        .send({ columnId: foreign, order: 0 });
      expect(response.status).toBe(400);
    });

    it('supprime une tache (204) puis 404', async () => {
      const task = (await create(member, {})).body as { id: string };
      expect(
        (await t.http.delete(`/api/tasks/${task.id}`).set(as(member))).status,
      ).toBe(204);
      const again = await t.http
        .delete(`/api/tasks/${task.id}`)
        .set(as(member));
      expect(again.status).toBe(404);
      expect((again.body as { message: string }).message).toBe(
        "Cette tache n'existe pas.",
      );
    });
  });

  describe('lecture', () => {
    it('un projet public actif se lit sans jeton', async () => {
      expect(
        (await t.http.get(`/api/projects/${project.slug}/tasks`)).status,
      ).toBe(200);
      expect(
        (await t.http.get(`/api/projects/${project.slug}/columns`)).status,
      ).toBe(200);
    });

    it('un projet prive refuse les lectures aux non-membres (403)', async () => {
      const secret = await createProject(t, owner, {
        visibility: 'private',
        participation: 'on_invite',
        publish: true,
      });
      expect(
        (await t.http.get(`/api/projects/${secret.slug}/tasks`)).status,
      ).toBe(403);
      expect(
        (
          await t.http
            .get(`/api/projects/${secret.slug}/tasks`)
            .set(as(outsider))
        ).status,
      ).toBe(403);
      expect(
        (await t.http.get(`/api/projects/${secret.slug}/tasks`).set(as(owner)))
          .status,
      ).toBe(200);
    });
  });

  describe('colonnes (R-K2, R-K3)', () => {
    let own: TestProject;
    beforeAll(async () => {
      own = await createProject(t, owner, {
        title: 'Projet colonnes',
        publish: true,
      });
    });

    it('un membre ne cree pas de colonne (403)', async () => {
      await addMember(t, owner, own, member, 'member');
      const response = await t.http
        .post(`/api/projects/${own.slug}/columns`)
        .set(as(member))
        .send({ label: 'Non' });
      expect(response.status).toBe(403);
    });

    it('limite a 6 colonnes (400)', async () => {
      for (const label of ['Q1', 'Q2', 'Q3']) {
        const ok = await t.http
          .post(`/api/projects/${own.slug}/columns`)
          .set(as(owner))
          .send({ label });
        expect(ok.status).toBe(201);
      }
      const seventh = await t.http
        .post(`/api/projects/${own.slug}/columns`)
        .set(as(owner))
        .send({ label: 'Q4' });
      expect(seventh.status).toBe(400);
      expect((seventh.body as { message: string }).message).toBe(
        'Un projet ne peut pas avoir plus de 6 colonnes.',
      );
    });

    it('supprimer exige une colonne de destination, puis y deplace les taches', async () => {
      const columns = (
        await t.http.get(`/api/projects/${own.slug}/columns`).set(as(owner))
      ).body as {
        id: string;
      }[];
      const [first, second] = columns;
      const task = (
        await t.http
          .post('/api/tasks')
          .set(as(owner))
          .send({ columnId: first.id, title: 'Survivante' })
      ).body as { id: string };

      const noTarget = await t.http
        .delete(`/api/columns/${first.id}`)
        .set(as(owner));
      expect(noTarget.status).toBe(400);
      const self = await t.http
        .delete(`/api/columns/${first.id}`)
        .query({ moveTo: first.id })
        .set(as(owner));
      expect(self.status).toBe(400);
      const denied = await t.http
        .delete(`/api/columns/${first.id}`)
        .query({ moveTo: second.id })
        .set(as(member));
      expect(denied.status).toBe(403);

      const ok = await t.http
        .delete(`/api/columns/${first.id}`)
        .query({ moveTo: second.id })
        .set(as(owner));
      expect(ok.status).toBe(204);
      const tasks = (
        await t.http.get(`/api/projects/${own.slug}/tasks`).set(as(owner))
      ).body as {
        id: string;
        columnId: string;
      }[];
      expect(tasks.find((entry) => entry.id === task.id)?.columnId).toBe(
        second.id,
      );
    });

    it('la derniere colonne ne se supprime pas (400)', async () => {
      const solo = await createProject(t, owner, {
        title: 'Une seule colonne',
      });
      let columns = (
        await t.http.get(`/api/projects/${solo.slug}/columns`).set(as(owner))
      ).body as {
        id: string;
      }[];
      while (columns.length > 1) {
        const [head, next] = columns;
        await t.http
          .delete(`/api/columns/${head.id}`)
          .query({ moveTo: next.id })
          .set(as(owner));
        columns = (
          await t.http.get(`/api/projects/${solo.slug}/columns`).set(as(owner))
        ).body as {
          id: string;
        }[];
      }
      const response = await t.http
        .delete(`/api/columns/${columns[0].id}`)
        .query({ moveTo: columns[0].id })
        .set(as(owner));
      expect(response.status).toBe(400);
      expect((response.body as { message: string }).message).toBe(
        'Un projet garde au moins une colonne dans Les Taches.',
      );
    });
  });
});
