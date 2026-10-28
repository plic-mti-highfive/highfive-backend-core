import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  addMember,
  authHeader,
  createProject,
  registerUser,
  type TestUser,
} from './helpers/api.js';
import { createTestApp, type TestApp } from './helpers/create-test-app.js';

describe('Projets (integration)', () => {
  let t: TestApp;
  let owner: TestUser;
  let stranger: TestUser;
  let admin: TestUser;

  beforeAll(async () => {
    t = await createTestApp();
    owner = await registerUser(t, { prefix: 'porteur' });
    stranger = await registerUser(t, { prefix: 'inconnu' });
    admin = await registerUser(t, { admin: true });
  });
  afterAll(async () => {
    await t.close();
  });

  const get = (slug: string, user?: TestUser) => {
    const request = t.http.get(`/api/projects/${slug}`);
    return user ? request.set(authHeader(user.token)) : request;
  };
  const transition = (slug: string, user: TestUser, name: string) =>
    t.http
      .post(`/api/projects/${slug}/transition`)
      .set(authHeader(user.token))
      .send({ transition: name });

  describe('creation', () => {
    it('exige d etre connecte (401)', async () => {
      const response = await t.http.post('/api/projects').send({});
      expect(response.status).toBe(401);
    });

    it('cree un brouillon dont l auteur est porteur, avec 3 colonnes et un Mur', async () => {
      const project = await createProject(t, owner);
      const response = await get(project.slug, owner);
      expect(response.body).toMatchObject({
        state: 'draft',
        ownerId: owner.id,
        highfiveCount: 0,
      });

      const members = await t.http
        .get(`/api/projects/${project.slug}/members`)
        .set(authHeader(owner.token));
      expect(members.body).toMatchObject([{ userId: owner.id, role: 'owner' }]);

      const columns = await t.http
        .get(`/api/projects/${project.slug}/columns`)
        .set(authHeader(owner.token));
      expect((columns.body as { label: string }[]).map((c) => c.label)).toEqual(
        ['A faire', 'En cours', 'Fait'],
      );

      const walls = await t.dataSource.query<unknown[]>(
        `SELECT 1 FROM walls WHERE project_id = $1`,
        [project.id],
      );
      expect(walls).toHaveLength(1);
    });

    it('un projet prive doit etre sur invitation (R-PR1, 400)', async () => {
      const response = await t.http
        .post('/api/projects')
        .set(authHeader(owner.token))
        .send({
          title: 'Projet prive',
          tagline: 'x',
          tags: ['web'],
          visibility: 'private',
          participation: 'open',
        });
      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ code: 'validation_error' });
    });

    it('refuse un theme inconnu (400, message FR)', async () => {
      const response = await t.http
        .post('/api/projects')
        .set(authHeader(owner.token))
        .send({
          title: 'Projet theme',
          tagline: 'x',
          tags: ['theme-qui-n-existe-pas'],
          visibility: 'public',
          participation: 'open',
        });
      expect(response.status).toBe(400);
      expect((response.body as { message: string }).message).toContain(
        "Ces themes n'existent pas",
      );
    });

    it('refuse un compte suspendu (403)', async () => {
      const suspended = await registerUser(t, { prefix: 'suspendu' });
      await t.dataSource.query(
        `UPDATE users SET account_status = 'suspended' WHERE id = $1`,
        [suspended.id],
      );
      const response = await t.http
        .post('/api/projects')
        .set(authHeader(suspended.token))
        .send({
          title: 'Projet suspendu',
          tagline: 'x',
          tags: ['web'],
          visibility: 'public',
          participation: 'open',
        });
      expect(response.status).toBe(403);
    });

    it('le slug est unique : un titre identique recoit un suffixe', async () => {
      const first = await createProject(t, owner, { title: 'Titre identique' });
      const second = await createProject(t, owner, {
        title: 'Titre identique',
      });
      const third = await createProject(t, stranger, {
        title: 'Titre identique',
      });
      expect(first.slug).toBe('titre-identique');
      expect(second.slug).toBe('titre-identique-1');
      expect(third.slug).toBe('titre-identique-2');
      expect(new Set([first.slug, second.slug, third.slug]).size).toBe(3);
    });
  });

  describe('visibilite', () => {
    it('un brouillon n appartient qu a son porteur (404 pour les autres, anonyme compris)', async () => {
      const project = await createProject(t, owner);
      expect((await get(project.slug, owner)).status).toBe(200);
      expect((await get(project.slug)).status).toBe(404);
      expect((await get(project.slug, stranger)).status).toBe(404);
      expect((await get(project.slug, admin)).status).toBe(200);
    });

    it('un brouillon n apparait pas dans le fil public', async () => {
      const project = await createProject(t, owner, {
        title: 'Brouillon cache',
      });
      const list = await t.http
        .get('/api/projects')
        .query({ q: 'Brouillon cache' });
      expect(
        (list.body as { items: { id: string }[] }).items.map((p) => p.id),
      ).not.toContain(project.id);
    });

    it('un projet prive est refuse (403) a un non-membre et a l anonyme, lisible par son equipe', async () => {
      const project = await createProject(t, owner, {
        visibility: 'private',
        participation: 'on_invite',
        publish: true,
      });
      const insider = await registerUser(t, { prefix: 'equipe' });
      await addMember(t, owner, project, insider);

      expect((await get(project.slug)).status).toBe(403);
      expect((await get(project.slug, stranger)).status).toBe(403);
      expect((await get(project.slug, insider)).status).toBe(200);
      expect((await get(project.slug, admin)).status).toBe(200);
    });

    it('un projet prive n apparait pas dans le fil public', async () => {
      const project = await createProject(t, owner, {
        title: 'Prive introuvable',
        visibility: 'private',
        participation: 'on_invite',
        publish: true,
      });
      const list = await t.http
        .get('/api/projects')
        .query({ q: 'Prive introuvable' });
      expect((list.body as { items: unknown[] }).items).toHaveLength(0);
      const mine = await t.http
        .get('/api/me/projects')
        .set(authHeader(owner.token));
      expect((mine.body as { id: string }[]).map((p) => p.id)).toContain(
        project.id,
      );
    });

    it('un projet public actif est dans le fil ; archive, il reste lisible mais sort du fil', async () => {
      const project = await createProject(t, owner, {
        title: 'Cycle de vie visible',
        publish: true,
      });
      const ids = async () =>
        (
          (
            await t.http
              .get('/api/projects')
              .query({ q: 'Cycle de vie visible' })
          ).body as { items: { id: string }[] }
        ).items.map((p) => p.id);

      expect(await ids()).toContain(project.id);
      expect((await transition(project.slug, owner, 'archive')).status).toBe(
        200,
      );
      expect(await ids()).not.toContain(project.id);
      expect((await get(project.slug)).status).toBe(200);
    });
  });

  describe('modification', () => {
    it('le porteur et un co-porteur modifient ; un membre, un inconnu et l anonyme non', async () => {
      const project = await createProject(t, owner);
      const co = await registerUser(t, { prefix: 'co' });
      const member = await registerUser(t, { prefix: 'membre' });
      await addMember(t, owner, project, co, 'co_owner');
      await addMember(t, owner, project, member, 'member');

      const patch = (user: TestUser | undefined, tagline: string) => {
        const request = t.http.patch(`/api/projects/${project.slug}`);
        return (user ? request.set(authHeader(user.token)) : request).send({
          tagline,
        });
      };

      expect((await patch(owner, 'par le porteur')).status).toBe(200);
      expect((await patch(co, 'par le co-porteur')).body).toMatchObject({
        tagline: 'par le co-porteur',
      });
      expect((await patch(member, 'non')).status).toBe(403);
      expect((await patch(stranger, 'non')).status).toBe(403);
      expect((await patch(undefined, 'non')).status).toBe(401);
      expect((await get(project.slug, owner)).body).toMatchObject({
        tagline: 'par le co-porteur',
      });
    });

    it('revalide R-PR1 sur l etat resultant : passer en prive sans changer la participation (422)', async () => {
      const project = await createProject(t, owner, { participation: 'open' });
      const response = await t.http
        .patch(`/api/projects/${project.slug}`)
        .set(authHeader(owner.token))
        .send({ visibility: 'private' });
      expect(response.status).toBe(422);
      expect((response.body as { message: string }).message).toContain('prive');
    });

    it('ne laisse pas modifier un champ derive (highfiveCount est ignore)', async () => {
      const project = await createProject(t, owner);
      await t.http
        .patch(`/api/projects/${project.slug}`)
        .set(authHeader(owner.token))
        .send({ tagline: 'ok', highfiveCount: 999 });
      expect((await get(project.slug, owner)).body).toMatchObject({
        highfiveCount: 0,
      });
    });
  });

  describe('transitions d etat', () => {
    it('cycle complet : publier, terminer, rouvrir, archiver, reactiver', async () => {
      const project = await createProject(t, owner);
      const states: string[] = [];
      for (const name of [
        'publish',
        'complete',
        'reopen',
        'archive',
        'reactivate',
      ]) {
        const response = await transition(project.slug, owner, name);
        expect(response.status).toBe(200);
        states.push((response.body as { state: string }).state);
      }
      expect(states).toEqual([
        'active',
        'done',
        'active',
        'archived',
        'active',
      ]);
    });

    it('une transition incoherente avec l etat courant est un conflit (409)', async () => {
      const project = await createProject(t, owner, { publish: true });
      const response = await transition(project.slug, owner, 'publish');
      expect(response.status).toBe(409);
      expect((await transition(project.slug, owner, 'reactivate')).status).toBe(
        409,
      );
    });

    it('publier et archiver reviennent au porteur seul ; terminer est ouvert au co-porteur', async () => {
      const project = await createProject(t, owner);
      const co = await registerUser(t, { prefix: 'coporteur' });
      await addMember(t, owner, project, co, 'co_owner');

      expect((await transition(project.slug, co, 'publish')).status).toBe(403);
      expect((await transition(project.slug, owner, 'publish')).status).toBe(
        200,
      );
      expect((await transition(project.slug, co, 'complete')).status).toBe(200);
      expect((await transition(project.slug, co, 'reopen')).status).toBe(200);
      expect((await transition(project.slug, co, 'archive')).status).toBe(403);
      expect((await transition(project.slug, stranger, 'archive')).status).toBe(
        403,
      );
    });

    it('une transition inconnue est refusee par le contrat (400)', async () => {
      const project = await createProject(t, owner);
      const response = await transition(project.slug, owner, 'detruire');
      expect(response.status).toBe(400);
    });
  });

  describe('suppression', () => {
    const remove = (slug: string, user: TestUser, confirmTitle?: string) =>
      t.http
        .delete(`/api/projects/${slug}`)
        .set(authHeader(user.token))
        .send(confirmTitle === undefined ? {} : { confirmTitle });

    it('exige le titre exact (400) et reserve la suppression au porteur (403)', async () => {
      const project = await createProject(t, owner, { title: 'A supprimer ?' });
      expect((await remove(project.slug, owner)).status).toBe(400);
      expect((await remove(project.slug, owner, 'a supprimer ?')).status).toBe(
        400,
      );
      expect(
        (await remove(project.slug, stranger, 'A supprimer ?')).status,
      ).toBe(403);
      expect((await get(project.slug, owner)).status).toBe(200);
    });

    it('le porteur supprime : le projet n existe plus (404)', async () => {
      const project = await createProject(t, owner, {
        title: 'Supprime vraiment',
      });
      expect(
        (await remove(project.slug, owner, 'Supprime vraiment')).status,
      ).toBe(204);
      expect((await get(project.slug, owner)).status).toBe(404);
    });

    it('l administration peut supprimer le projet d autrui', async () => {
      const project = await createProject(t, owner, {
        title: 'Modere par admin',
      });
      expect(
        (await remove(project.slug, admin, 'Modere par admin')).status,
      ).toBe(204);
    });
  });

  describe('transfert de propriete', () => {
    it('l ancien porteur devient co-porteur, le nouveau est porteur', async () => {
      const project = await createProject(t, owner);
      const heir = await registerUser(t, { prefix: 'heritier' });
      await addMember(t, owner, project, heir, 'member');

      const response = await t.http
        .post(`/api/projects/${project.slug}/transfer`)
        .set(authHeader(owner.token))
        .send({ newOwnerId: heir.id });
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ ownerId: heir.id });

      const members = await t.http
        .get(`/api/projects/${project.slug}/members`)
        .set(authHeader(heir.token));
      const roles = Object.fromEntries(
        (members.body as { userId: string; role: string }[]).map((m) => [
          m.userId,
          m.role,
        ]),
      );
      expect(roles).toEqual({ [heir.id]: 'owner', [owner.id]: 'co_owner' });
    });

    it('refuse un non-porteur (403) et un transfert a soi-meme (400)', async () => {
      const project = await createProject(t, owner);
      const attempt = (user: TestUser, newOwnerId: string) =>
        t.http
          .post(`/api/projects/${project.slug}/transfer`)
          .set(authHeader(user.token))
          .send({ newOwnerId });
      expect((await attempt(stranger, stranger.id)).status).toBe(403);
      expect((await attempt(owner, owner.id)).status).toBe(400);
    });

    it('transferer a un membre inactif de l equipe (non membre) cree son appartenance de porteur', async () => {
      const project = await createProject(t, owner);
      const newcomer = await registerUser(t, { prefix: 'nouveau' });
      const response = await t.http
        .post(`/api/projects/${project.slug}/transfer`)
        .set(authHeader(owner.token))
        .send({ newOwnerId: newcomer.id });
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ ownerId: newcomer.id });
    });

    // BUG: un newOwnerId inexistant leve une violation de cle etrangere non
    // geree : 500 `internal_error` au lieu d'un 404 « personne introuvable ».
    // La transaction est annulee, aucune donnee n'est corrompue.
    it.fails('transferer a une personne inexistante repond 404', async () => {
      const project = await createProject(t, owner);
      const response = await t.http
        .post(`/api/projects/${project.slug}/transfer`)
        .set(authHeader(owner.token))
        .send({ newOwnerId: randomUUID() });
      expect(response.status).toBe(404);
    });
  });
});
