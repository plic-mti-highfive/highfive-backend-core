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

describe('Equipes : candidatures, invitations, roles (integration)', () => {
  let t: TestApp;
  let owner: TestUser;

  beforeAll(async () => {
    t = await createTestApp();
    owner = await registerUser(t, { prefix: 'porteur' });
  });
  afterAll(async () => {
    await t.close();
  });

  const as = (user: TestUser) => authHeader(user.token);
  const apply = (project: TestProject, user: TestUser, message?: string) =>
    t.http
      .post(`/api/projects/${project.slug}/join-requests`)
      .set(as(user))
      .send(message ? { message } : {});
  const roleOf = async (project: TestProject, user: TestUser) => {
    const response = await t.http
      .get(`/api/projects/${project.slug}/members`)
      .set(as(owner));
    return (response.body as { userId: string; role: string }[]).find(
      (member) => member.userId === user.id,
    )?.role;
  };
  const pendingRequestId = async (project: TestProject): Promise<string> => {
    const list = await t.http
      .get(`/api/projects/${project.slug}/join-requests`)
      .set(as(owner));
    return (list.body as { id: string; status: string }[]).find(
      (request) => request.status === 'pending',
    )!.id;
  };

  describe('candidature', () => {
    it('projet ouvert : l accepte d emblee comme membre', async () => {
      const project = await createProject(t, owner, {
        participation: 'open',
        publish: true,
      });
      const user = await registerUser(t);
      const response = await apply(project, user);
      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({ status: 'accepted' });
      expect(await roleOf(project, user)).toBe('member');
    });

    it('sur demande : cree une demande en attente, sans membership', async () => {
      const project = await createProject(t, owner, {
        participation: 'on_request',
        publish: true,
      });
      const user = await registerUser(t);
      const response = await apply(project, user, 'Je veux aider');
      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        status: 'pending',
        message: 'Je veux aider',
      });
      expect(await roleOf(project, user)).toBeUndefined();
    });

    it('pas de doublon : une demande en attente ou une appartenance existante donne 409', async () => {
      const project = await createProject(t, owner, {
        participation: 'on_request',
        publish: true,
      });
      const user = await registerUser(t);
      expect((await apply(project, user)).status).toBe(201);
      const again = await apply(project, user);
      expect(again.status).toBe(409);
      expect((again.body as { message: string }).message).toBe(
        'Ta demande est deja en attente.',
      );

      const open = await createProject(t, owner, {
        participation: 'open',
        publish: true,
      });
      expect((await apply(open, user)).status).toBe(201);
      const member = await apply(open, user);
      expect(member.status).toBe(409);
      expect((member.body as { message: string }).message).toBe(
        'Tu fais deja partie de ce projet.',
      );
    });

    it('sur invitation : candidature refusee (403)', async () => {
      const project = await createProject(t, owner, {
        participation: 'on_invite',
        publish: true,
      });
      const response = await apply(project, await registerUser(t));
      expect(response.status).toBe(403);
      expect((response.body as { message: string }).message).toBe(
        'Ce projet ne se rejoint que sur invitation.',
      );
    });

    it('un projet prive reste ferme a un non-membre (403) et une candidature anonyme est refusee (401)', async () => {
      const project = await createProject(t, owner, {
        visibility: 'private',
        participation: 'on_invite',
        publish: true,
      });
      expect((await apply(project, await registerUser(t))).status).toBe(403);
      const anonymous = await t.http
        .post(`/api/projects/${project.slug}/join-requests`)
        .send({});
      expect(anonymous.status).toBe(401);
    });

    it('un compte suspendu ne peut pas rejoindre (403)', async () => {
      const project = await createProject(t, owner, {
        participation: 'open',
        publish: true,
      });
      const user = await registerUser(t);
      await t.dataSource.query(
        `UPDATE users SET account_status = 'suspended' WHERE id = $1`,
        [user.id],
      );
      expect((await apply(project, user)).status).toBe(403);
    });
  });

  describe('traitement des demandes', () => {
    it('le porteur accepte : la personne devient membre ; une seconde decision est un conflit', async () => {
      const project = await createProject(t, owner, {
        participation: 'on_request',
        publish: true,
      });
      const user = await registerUser(t);
      await apply(project, user);
      const id = await pendingRequestId(project);

      const accepted = await t.http
        .post(`/api/projects/${project.slug}/join-requests/${id}/accept`)
        .set(as(owner));
      expect(accepted.status).toBe(204);
      expect(await roleOf(project, user)).toBe('member');

      const again = await t.http
        .post(`/api/projects/${project.slug}/join-requests/${id}/reject`)
        .set(as(owner));
      expect(again.status).toBe(409);
      expect(await roleOf(project, user)).toBe('member');
    });

    it('seuls porteur et co-porteurs traitent les demandes (403 pour membre et inconnu)', async () => {
      const project = await createProject(t, owner, {
        participation: 'on_request',
        publish: true,
      });
      const member = await registerUser(t);
      const co = await registerUser(t);
      const outsider = await registerUser(t);
      const applicant = await registerUser(t);
      await addMember(t, owner, project, member, 'member');
      await addMember(t, owner, project, co, 'co_owner');
      await apply(project, applicant);
      const id = await pendingRequestId(project);
      const accept = (user: TestUser) =>
        t.http
          .post(`/api/projects/${project.slug}/join-requests/${id}/accept`)
          .set(as(user));

      expect((await accept(member)).status).toBe(403);
      expect((await accept(outsider)).status).toBe(403);
      expect(
        (
          await t.http
            .get(`/api/projects/${project.slug}/join-requests`)
            .set(as(member))
        ).status,
      ).toBe(403);
      expect((await accept(co)).status).toBe(204);
    });

    it('un refus n ajoute personne ; la nouvelle demande est bloquee 30 jours (409)', async () => {
      const project = await createProject(t, owner, {
        participation: 'on_request',
        publish: true,
      });
      const user = await registerUser(t);
      await apply(project, user);
      const id = await pendingRequestId(project);
      const rejected = await t.http
        .post(`/api/projects/${project.slug}/join-requests/${id}/reject`)
        .set(as(owner));
      expect(rejected.status).toBe(204);
      expect(await roleOf(project, user)).toBeUndefined();

      const retry = await apply(project, user);
      expect(retry.status).toBe(409);
      expect((retry.body as { message: string }).message).toContain(
        'refusee recemment',
      );

      await t.dataSource.query(
        `UPDATE join_requests SET decided_at = now() - interval '31 days' WHERE user_id = $1`,
        [user.id],
      );
      expect((await apply(project, user)).status).toBe(201);
    });

    it('une demande inconnue donne 404', async () => {
      const project = await createProject(t, owner, {
        participation: 'on_request',
        publish: true,
      });
      const response = await t.http
        .post(
          `/api/projects/${project.slug}/join-requests/${randomUUID()}/accept`,
        )
        .set(as(owner));
      expect(response.status).toBe(404);
    });
  });

  describe('quitter, roles, exclusion', () => {
    it('un membre quitte ; il peut ensuite redemander', async () => {
      const project = await createProject(t, owner, {
        participation: 'open',
        publish: true,
      });
      const user = await registerUser(t);
      await apply(project, user);
      const left = await t.http
        .post(`/api/projects/${project.slug}/leave`)
        .set(as(user));
      expect(left.status).toBe(204);
      expect(await roleOf(project, user)).toBeUndefined();
      expect((await apply(project, user)).status).toBe(201);
    });

    it('le porteur ne peut pas partir (R-M3, 403)', async () => {
      const project = await createProject(t, owner, { publish: true });
      const response = await t.http
        .post(`/api/projects/${project.slug}/leave`)
        .set(as(owner));
      expect(response.status).toBe(403);
      expect(await roleOf(project, owner)).toBe('owner');
    });

    it('le porteur change un role ; un co-porteur ne le peut pas', async () => {
      const project = await createProject(t, owner, { publish: true });
      const co = await registerUser(t);
      const member = await registerUser(t);
      await addMember(t, owner, project, co, 'co_owner');
      await addMember(t, owner, project, member, 'member');
      const patch = (user: TestUser, target: TestUser, role: string) =>
        t.http
          .patch(`/api/projects/${project.slug}/members/${target.id}`)
          .set(as(user))
          .send({ role });

      expect((await patch(co, member, 'observer')).status).toBe(403);
      const ok = await patch(owner, member, 'co_owner');
      expect(ok.status).toBe(200);
      expect(ok.body).toMatchObject({ userId: member.id, role: 'co_owner' });
      expect(await roleOf(project, member)).toBe('co_owner');
    });

    it('on ne donne pas la propriete par un role (400) et on ne retrograde pas le porteur (403)', async () => {
      const project = await createProject(t, owner, { publish: true });
      const member = await registerUser(t);
      await addMember(t, owner, project, member, 'member');
      const patch = (target: TestUser, role: string) =>
        t.http
          .patch(`/api/projects/${project.slug}/members/${target.id}`)
          .set(as(owner))
          .send({ role });

      expect((await patch(member, 'owner')).status).toBe(400);
      const demote = await patch(owner, 'member');
      expect(demote.status).toBe(403);
      expect((demote.body as { message: string }).message).toBe(
        'Le porteur garde son role.',
      );
      expect(await roleOf(project, owner)).toBe('owner');
    });

    it('changer le role d une personne hors equipe donne 404', async () => {
      const project = await createProject(t, owner, { publish: true });
      const response = await t.http
        .patch(`/api/projects/${project.slug}/members/${randomUUID()}`)
        .set(as(owner))
        .send({ role: 'member' });
      expect(response.status).toBe(404);
    });

    it('un co-porteur exclut un membre ; un membre n exclut personne ; le porteur est intouchable', async () => {
      const project = await createProject(t, owner, { publish: true });
      const co = await registerUser(t);
      const member = await registerUser(t);
      const other = await registerUser(t);
      await addMember(t, owner, project, co, 'co_owner');
      await addMember(t, owner, project, member, 'member');
      await addMember(t, owner, project, other, 'member');
      const remove = (user: TestUser, target: TestUser) =>
        t.http
          .delete(`/api/projects/${project.slug}/members/${target.id}`)
          .set(as(user));

      expect((await remove(member, other)).status).toBe(403);
      expect((await remove(co, owner)).status).toBe(403);
      expect((await remove(owner, owner)).status).toBe(403);
      expect((await remove(co, member)).status).toBe(204);
      expect(await roleOf(project, member)).toBeUndefined();
      expect(await roleOf(project, owner)).toBe('owner');
    });

    it('un identifiant non UUID est refuse avant tout traitement (400)', async () => {
      const project = await createProject(t, owner, { publish: true });
      const response = await t.http
        .delete(`/api/projects/${project.slug}/members/pas-un-uuid`)
        .set(as(owner));
      expect(response.status).toBe(400);
    });
  });

  describe('blocage', () => {
    it('une personne bloquee perd son role et ne peut plus revenir (403)', async () => {
      const project = await createProject(t, owner, {
        participation: 'open',
        publish: true,
      });
      const user = await registerUser(t);
      await apply(project, user);
      const blocked = await t.http
        .post(`/api/projects/${project.slug}/members/${user.id}/block`)
        .set(as(owner));
      expect(blocked.status).toBe(204);

      const retry = await apply(project, user);
      expect(retry.status).toBe(403);
      expect((retry.body as { message: string }).message).toBe(
        'Tu ne peux pas rejoindre ce projet.',
      );

      const task = await t.http
        .get(`/api/projects/${project.slug}/join-requests`)
        .set(as(user));
      expect(task.status).toBe(403);
    });

    it('bloquer une personne hors equipe est possible et la tient dehors', async () => {
      const project = await createProject(t, owner, {
        participation: 'open',
        publish: true,
      });
      const user = await registerUser(t);
      await t.http
        .post(`/api/projects/${project.slug}/members/${user.id}/block`)
        .set(as(owner));
      expect((await apply(project, user)).status).toBe(403);
    });

    it('le porteur ne peut pas etre bloque (403) ; un membre ne bloque personne', async () => {
      const project = await createProject(t, owner, { publish: true });
      const member = await registerUser(t);
      await addMember(t, owner, project, member, 'member');
      expect(
        (
          await t.http
            .post(`/api/projects/${project.slug}/members/${owner.id}/block`)
            .set(as(owner))
        ).status,
      ).toBe(403);
      expect(
        (
          await t.http
            .post(`/api/projects/${project.slug}/members/${owner.id}/block`)
            .set(as(member))
        ).status,
      ).toBe(403);
    });

    it('inviter une personne bloquee est refuse (403)', async () => {
      const project = await createProject(t, owner, { publish: true });
      const user = await registerUser(t);
      await t.http
        .post(`/api/projects/${project.slug}/members/${user.id}/block`)
        .set(as(owner));
      const response = await t.http
        .post(`/api/projects/${project.slug}/invitations`)
        .set(as(owner))
        .send({ recipientId: user.id, proposedRole: 'member' });
      expect(response.status).toBe(403);
    });
  });

  describe('invitations', () => {
    const invite = (
      project: TestProject,
      by: TestUser,
      recipient: TestUser,
      role = 'member',
    ) =>
      t.http
        .post(`/api/projects/${project.slug}/invitations`)
        .set(as(by))
        .send({ recipientId: recipient.id, proposedRole: role });

    it('accepter cree l appartenance au role propose', async () => {
      const project = await createProject(t, owner, {
        participation: 'on_invite',
        publish: true,
      });
      const user = await registerUser(t);
      const created = await invite(project, owner, user, 'observer');
      expect(created.status).toBe(201);
      expect(created.body).toMatchObject({
        status: 'pending',
        proposedRole: 'observer',
      });

      const id = (created.body as { id: string }).id;
      expect(
        (await t.http.post(`/api/invitations/${id}/accept`).set(as(user)))
          .status,
      ).toBe(204);
      expect(await roleOf(project, user)).toBe('observer');
    });

    it('seul le destinataire repond (404 pour les autres) ; une reponse est definitive (409)', async () => {
      const project = await createProject(t, owner, { publish: true });
      const user = await registerUser(t);
      const other = await registerUser(t);
      const id = ((await invite(project, owner, user)).body as { id: string })
        .id;

      expect(
        (await t.http.post(`/api/invitations/${id}/accept`).set(as(other)))
          .status,
      ).toBe(404);
      expect(
        (await t.http.post(`/api/invitations/${id}/reject`).set(as(user)))
          .status,
      ).toBe(204);
      expect(await roleOf(project, user)).toBeUndefined();
      expect(
        (await t.http.post(`/api/invitations/${id}/accept`).set(as(user)))
          .status,
      ).toBe(409);
    });

    it('une invitation expiree ne peut plus etre acceptee (409)', async () => {
      const project = await createProject(t, owner, { publish: true });
      const user = await registerUser(t);
      const id = ((await invite(project, owner, user)).body as { id: string })
        .id;
      await t.dataSource.query(
        `UPDATE invitations SET expires_at = now() - interval '1 day' WHERE id = $1`,
        [id],
      );
      const response = await t.http
        .post(`/api/invitations/${id}/accept`)
        .set(as(user));
      expect(response.status).toBe(409);
      expect((response.body as { message: string }).message).toBe(
        'Cette invitation a expire.',
      );
    });

    it('refuse les doublons : invitation en cours, ou personne deja dans l equipe (409)', async () => {
      const project = await createProject(t, owner, { publish: true });
      const user = await registerUser(t);
      expect((await invite(project, owner, user)).status).toBe(201);
      expect((await invite(project, owner, user)).status).toBe(409);
      expect((await invite(project, owner, owner)).status).toBe(409);
    });

    it('seuls porteur et co-porteurs invitent (403) ; destinataire inconnu : 404', async () => {
      const project = await createProject(t, owner, { publish: true });
      const member = await registerUser(t);
      const user = await registerUser(t);
      await addMember(t, owner, project, member, 'member');
      expect((await invite(project, member, user)).status).toBe(403);
      const unknown = await t.http
        .post(`/api/projects/${project.slug}/invitations`)
        .set(as(owner))
        .send({ recipientId: randomUUID(), proposedRole: 'member' });
      expect(unknown.status).toBe(404);
    });

    it('on ne peut pas inviter comme porteur (400)', async () => {
      const project = await createProject(t, owner, { publish: true });
      const user = await registerUser(t);
      expect((await invite(project, owner, user, 'owner')).status).toBe(400);
    });
  });
});
