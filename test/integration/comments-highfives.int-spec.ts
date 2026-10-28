import { randomUUID } from 'node:crypto';
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

describe('Commentaires et highfives (integration)', () => {
  let t: TestApp;
  let owner: TestUser;
  let co: TestUser;
  let member: TestUser;
  let visitor: TestUser;
  let admin: TestUser;
  let project: TestProject;

  beforeAll(async () => {
    t = await createTestApp();
    owner = await registerUser(t, { prefix: 'porteur' });
    co = await registerUser(t, { prefix: 'co' });
    member = await registerUser(t, { prefix: 'membre' });
    visitor = await registerUser(t, { prefix: 'visiteur' });
    admin = await registerUser(t, { admin: true });
    project = await createProject(t, owner, { publish: true });
    await addMember(t, owner, project, co, 'co_owner');
    await addMember(t, owner, project, member, 'member');
  });
  afterAll(async () => {
    await t.close();
  });

  const as = (user: TestUser) => authHeader(user.token);
  const comment = (
    user: TestUser | undefined,
    body: Record<string, unknown>,
    slug = project.slug,
  ) => {
    const request = t.http.post(`/api/projects/${slug}/comments`);
    return (user ? request.set(as(user)) : request).send(body);
  };
  const list = async (slug = project.slug, user?: TestUser) => {
    const request = t.http.get(`/api/projects/${slug}/comments`);
    return (await (user ? request.set(as(user)) : request)).body as {
      id: string;
      authorId: string;
    }[];
  };

  describe('commentaires', () => {
    it('un visiteur connecte commente un projet public ; la liste est publique', async () => {
      const response = await comment(visitor, { body: 'Bravo !' });
      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        body: 'Bravo !',
        authorId: visitor.id,
        hidden: false,
      });
      const comments = await list();
      expect(comments.map((entry) => entry.id)).toContain(
        (response.body as { id: string }).id,
      );
    });

    it('refuse l anonyme (401) et un corps vide ou trop long (400)', async () => {
      expect((await comment(undefined, { body: 'x' })).status).toBe(401);
      expect((await comment(visitor, { body: '' })).status).toBe(400);
      expect((await comment(visitor, { body: 'a'.repeat(1001) })).status).toBe(
        400,
      );
    });

    it('un projet prive n est commentable que par son equipe (403 sinon)', async () => {
      const secret = await createProject(t, owner, {
        visibility: 'private',
        participation: 'on_invite',
        publish: true,
      });
      await addMember(t, owner, secret, member);
      expect(
        (await comment(visitor, { body: 'intrus' }, secret.slug)).status,
      ).toBe(403);
      expect(
        (await comment(member, { body: 'equipe' }, secret.slug)).status,
      ).toBe(201);
      expect(
        (await t.http.get(`/api/projects/${secret.slug}/comments`)).status,
      ).toBe(403);
    });

    it('un compte suspendu ne commente plus (403)', async () => {
      const suspended = await registerUser(t, { prefix: 'suspendu' });
      await t.dataSource.query(
        `UPDATE users SET account_status = 'suspended' WHERE id = $1`,
        [suspended.id],
      );
      const response = await comment(suspended, { body: 'bonjour' });
      expect(response.status).toBe(403);
      expect((response.body as { message: string }).message).toBe(
        'Ton compte est suspendu : tu ne peux pas commenter.',
      );
    });

    it('un seul niveau de reponse (R-C4) : repondre a une reponse est refuse (400)', async () => {
      const root = (await comment(visitor, { body: 'racine' })).body as {
        id: string;
      };
      const reply = await comment(member, {
        body: 'reponse',
        parentId: root.id,
      });
      expect(reply.status).toBe(201);
      expect(reply.body).toMatchObject({ parentId: root.id });

      const nested = await comment(owner, {
        body: 'reponse a la reponse',
        parentId: (reply.body as { id: string }).id,
      });
      expect(nested.status).toBe(400);
    });

    it('un parent inconnu ou d un autre projet donne 404', async () => {
      const other = await createProject(t, owner, { publish: true });
      const foreign = (await comment(owner, { body: 'ailleurs' }, other.slug))
        .body as { id: string };
      expect(
        (await comment(visitor, { body: 'x', parentId: randomUUID() })).status,
      ).toBe(404);
      expect(
        (await comment(visitor, { body: 'x', parentId: foreign.id })).status,
      ).toBe(404);
    });

    it('masquer : porteur, co-porteur et admin oui ; membre et visiteur non ; le commentaire disparait', async () => {
      const make = async () =>
        (await comment(visitor, { body: 'a moderer' })).body as { id: string };
      const hide = (user: TestUser, id: string) =>
        t.http.post(`/api/comments/${id}/hide`).set(as(user));

      const first = await make();
      expect((await hide(member, first.id)).status).toBe(403);
      expect((await hide(visitor, first.id)).status).toBe(403);
      expect((await list()).map((entry) => entry.id)).toContain(first.id);

      for (const moderator of [owner, co, admin]) {
        const target = await make();
        expect((await hide(moderator, target.id)).status).toBe(204);
        expect((await list()).map((entry) => entry.id)).not.toContain(
          target.id,
        );
      }
      expect((await hide(owner, randomUUID())).status).toBe(404);
    });

    it('seule l administration supprime reellement un commentaire', async () => {
      const target = (await comment(visitor, { body: 'a supprimer' })).body as {
        id: string;
      };
      expect(
        (await t.http.delete(`/api/comments/${target.id}`).set(as(owner)))
          .status,
      ).toBe(403);
      expect(
        (await t.http.delete(`/api/comments/${target.id}`).set(as(visitor)))
          .status,
      ).toBe(403);
      expect(
        (await t.http.delete(`/api/comments/${target.id}`).set(as(admin)))
          .status,
      ).toBe(204);
      const rows = await t.dataSource.query<unknown[]>(
        `SELECT 1 FROM comments WHERE id = $1`,
        [target.id],
      );
      expect(rows).toHaveLength(0);
    });

    it('une personne bloquee ne commente plus et ses commentaires disparaissent (R-V8)', async () => {
      const troll = await registerUser(t, { prefix: 'troll' });
      const posted = (await comment(troll, { body: 'avant blocage' })).body as {
        id: string;
      };
      expect((await list()).map((entry) => entry.id)).toContain(posted.id);

      await t.http
        .post(`/api/projects/${project.slug}/members/${troll.id}/block`)
        .set(as(owner));
      const after = await comment(troll, { body: 'apres blocage' });
      expect(after.status).toBe(403);
      expect((await list()).map((entry) => entry.id)).not.toContain(posted.id);
    });
  });

  describe('highfives', () => {
    const give = (user: TestUser | undefined, slug = project.slug) => {
      const request = t.http.post(`/api/projects/${slug}/highfive`);
      return user ? request.set(as(user)) : request;
    };
    const withdraw = (user: TestUser, slug = project.slug) =>
      t.http.delete(`/api/projects/${slug}/highfive`).set(as(user));

    it('donner un highfive incremente le compteur ; le redonner est idempotent', async () => {
      const fan = await registerUser(t, { prefix: 'fan' });
      const first = await give(fan);
      expect(first.status).toBe(200);
      const count = (first.body as { highfiveCount: number }).highfiveCount;
      expect(first.body).toMatchObject({ given: true });

      const second = await give(fan);
      expect(second.body).toEqual({ given: true, highfiveCount: count });
      const rows = await t.dataSource.query<unknown[]>(
        `SELECT 1 FROM highfives WHERE project_id = $1 AND user_id = $2`,
        [project.id, fan.id],
      );
      expect(rows).toHaveLength(1);
    });

    it('le compteur de la fiche suit, et retirer est idempotent', async () => {
      const fan = await registerUser(t, { prefix: 'fan' });
      const before = (await t.http.get(`/api/projects/${project.slug}`))
        .body as { highfiveCount: number };
      await give(fan);
      const mid = (await t.http.get(`/api/projects/${project.slug}`)).body as {
        highfiveCount: number;
      };
      expect(mid.highfiveCount).toBe(before.highfiveCount + 1);

      const withdrawn = await withdraw(fan);
      expect(withdrawn.status).toBe(200);
      expect(withdrawn.body).toEqual({
        given: false,
        highfiveCount: before.highfiveCount,
      });
      const again = await withdraw(fan);
      expect(again.body).toEqual({
        given: false,
        highfiveCount: before.highfiveCount,
      });
    });

    it('le porteur ne highfive pas son propre projet (403)', async () => {
      const response = await give(owner);
      expect(response.status).toBe(403);
      expect((response.body as { message: string }).message).toBe(
        'On ne highfive pas son propre projet.',
      );
    });

    it('exige un jeton (401) ; un projet prive est ferme a un non-membre (403)', async () => {
      expect((await give(undefined)).status).toBe(401);
      const secret = await createProject(t, owner, {
        visibility: 'private',
        participation: 'on_invite',
        publish: true,
      });
      expect((await give(visitor, secret.slug)).status).toBe(403);
    });

    it('un brouillon d autrui n existe pas (404)', async () => {
      const draft = await createProject(t, owner);
      expect((await give(visitor, draft.slug)).status).toBe(404);
    });

    it('la liste des personnes est publique, paginee, et reflete les retraits', async () => {
      const target = await createProject(t, owner, { publish: true });
      const fans = [
        await registerUser(t),
        await registerUser(t),
        await registerUser(t),
      ];
      for (const fan of fans) await give(fan, target.slug);

      const page = await t.http
        .get(`/api/projects/${target.slug}/highfives`)
        .query({ limit: 2 });
      expect(page.status).toBe(200);
      const body = page.body as {
        items: { id: string }[];
        total: number;
        nextCursor?: string;
      };
      expect(body.items).toHaveLength(2);
      expect(body.total).toBe(3);
      expect(body.nextCursor).toBeTruthy();

      await withdraw(fans[0], target.slug);
      const all = (await t.http.get(`/api/projects/${target.slug}/highfives`))
        .body as {
        items: { id: string }[];
        total: number;
      };
      expect(all.total).toBe(2);
      expect(all.items.map((user) => user.id)).not.toContain(fans[0].id);
    });
  });
});
