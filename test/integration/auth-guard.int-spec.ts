import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authHeader, createProject, registerUser } from './helpers/api.js';
import { createTestApp, type TestApp } from './helpers/create-test-app.js';

describe('AuthGuard, roles et format d erreur (integration)', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  describe('routes publiques et protegees', () => {
    it.each(['/api/tags', '/api/projects'])(
      '%s est accessible sans jeton',
      async (path) => {
        expect((await t.http.get(path)).status).toBe(200);
      },
    );

    it.each(['/api/me', '/api/me/projects'])(
      '%s exige un jeton (401)',
      async (path) => {
        const response = await t.http.get(path);
        expect(response.status).toBe(401);
        expect(response.body).toMatchObject({ code: 'unauthorized' });
      },
    );

    it('une route publique reconnait pourtant le lecteur connecte (projet prive)', async () => {
      const owner = await registerUser(t, { prefix: 'proprio' });
      const project = await createProject(t, owner, {
        visibility: 'private',
        participation: 'on_invite',
        publish: true,
      });
      const anonymous = await t.http.get(`/api/projects/${project.slug}`);
      expect(anonymous.status).toBe(403);
      const connected = await t.http
        .get(`/api/projects/${project.slug}`)
        .set(authHeader(owner.token));
      expect(connected.status).toBe(200);
    });
  });

  describe('espace d administration', () => {
    it('anonyme : 401', async () => {
      const response = await t.http.get('/api/admin/reports');
      expect(response.status).toBe(401);
    });

    it('membre : 403 avec message FR', async () => {
      const member = await registerUser(t, { prefix: 'membre' });
      const response = await t.http
        .get('/api/admin/reports')
        .set(authHeader(member.token));
      expect(response.status).toBe(403);
      expect(response.body).toEqual({
        code: 'forbidden',
        message: "Cet espace est reserve a l'administration.",
      });
    });

    it('ADMIN_EMAILS fait autorite : le compte liste devient admin et accede a l espace', async () => {
      const admin = await registerUser(t, { admin: true });
      const me = await t.http.get('/api/me').set(authHeader(admin.token));
      expect(me.body).toMatchObject({ platformRole: 'admin' });
      const response = await t.http
        .get('/api/admin/reports')
        .set(authHeader(admin.token));
      expect(response.status).toBe(200);
    });

    it('aucune route ne permet de se donner le role admin', async () => {
      const member = await registerUser(t, { prefix: 'ambitieux' });
      await t.http
        .patch('/api/me')
        .set(authHeader(member.token))
        .send({ platformRole: 'admin' });
      const me = await t.http.get('/api/me').set(authHeader(member.token));
      expect(me.body).toMatchObject({ platformRole: 'member' });
    });
  });

  describe('format d erreur ApiError', () => {
    it('route inexistante : 404 au format ApiError', async () => {
      const response = await t.http.get('/api/route-qui-n-existe-pas');
      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('code', 'not_found');
      expect(typeof (response.body as { message: string }).message).toBe(
        'string',
      );
    });

    it('projet inconnu : 404 FR', async () => {
      const response = await t.http.get('/api/projects/slug-inexistant');
      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        code: 'not_found',
        message: "Ce projet n'existe pas.",
      });
    });

    it('JSON invalide : 400 au format ApiError', async () => {
      const response = await t.http
        .post('/api/auth/login')
        .set('Content-Type', 'application/json')
        .send('{pas du json');
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('code', 'validation_error');
    });

    it('identifiant non UUID dans l URL : 400 au format ApiError', async () => {
      const user = await registerUser(t, { prefix: 'uuid' });
      const response = await t.http
        .delete('/api/tasks/pas-un-uuid')
        .set(authHeader(user.token));
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('code', 'validation_error');
    });

    // BUG: ParseUUIDPipe leve « Validation failed (uuid is expected) » en
    // anglais et le filtre le laisse passer tel quel, alors que tout message
    // d'erreur doit etre en francais (CLAUDE.md).
    it.fails('identifiant non UUID : le message est en francais', async () => {
      const user = await registerUser(t, { prefix: 'uuidfr' });
      const response = await t.http
        .delete('/api/tasks/pas-un-uuid')
        .set(authHeader(user.token));
      expect((response.body as { message: string }).message).not.toMatch(
        /Validation failed/,
      );
    });

    it('une erreur de validation porte les details zod', async () => {
      const user = await registerUser(t, { prefix: 'details' });
      const response = await t.http
        .post('/api/projects')
        .set(authHeader(user.token))
        .send({ title: 'ab' });
      expect(response.status).toBe(400);
      const body = response.body as { details: { path: unknown[] }[] };
      expect(body.details.length).toBeGreaterThan(0);
      expect(body.details[0]).toHaveProperty('path');
    });
  });
});
