import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PasswordResetTokenEntity } from '../../src/entities/index.js';
import { authHeader, login, registerUser } from './helpers/api.js';
import {
  createTestApp,
  TEST_PASSWORD,
  type TestApp,
} from './helpers/create-test-app.js';

describe('Authentification (integration)', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  describe('inscription', () => {
    it('cree le compte et renvoie la session sans jamais exposer le mot de passe', async () => {
      const response = await t.http.post('/api/auth/register').send({
        email: 'Alice@Highfive.test',
        password: TEST_PASSWORD,
        username: 'alice',
        displayName: 'Alice',
      });
      expect(response.status).toBe(201);
      const body = response.body as {
        token: string;
        user: Record<string, unknown>;
      };
      expect(body.token.length).toBeGreaterThan(20);
      expect(body.user.username).toBe('alice');
      expect(body.user.email).toBe('alice@highfive.test');
      expect(JSON.stringify(body)).not.toContain('passwordHash');
      expect(JSON.stringify(body)).not.toContain(TEST_PASSWORD);
    });

    it('stocke un hash argon2 du mot de passe, jamais le mot de passe', async () => {
      const rows = await t.dataSource.query<{ password_hash: string }[]>(
        `SELECT password_hash FROM users WHERE username = 'alice'`,
      );
      expect(rows[0].password_hash).toMatch(/^\$argon2/);
      expect(rows[0].password_hash).not.toContain(TEST_PASSWORD);
    });

    it.each([
      ['email invalide', { email: 'pas-un-email' }],
      ['mot de passe trop court', { password: 'court' }],
      ['pseudo en majuscules', { username: 'Alice' }],
      ['pseudo trop court', { username: 'ab' }],
    ])('refuse un corps invalide : %s (400, message FR)', async (_, patch) => {
      const response = await t.http.post('/api/auth/register').send({
        email: 'valide@highfive.test',
        password: TEST_PASSWORD,
        username: 'valide',
        ...patch,
      });
      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        code: 'validation_error',
        message: "Le contenu envoye n'est pas valide.",
      });
      expect(
        Array.isArray((response.body as { details: unknown }).details),
      ).toBe(true);
    });

    it('refuse une adresse deja utilisee, sans tenir compte de la casse (409)', async () => {
      const response = await t.http.post('/api/auth/register').send({
        email: 'ALICE@highfive.test',
        password: TEST_PASSWORD,
        username: 'autre-pseudo',
      });
      expect(response.status).toBe(409);
      expect(response.body).toEqual({
        code: 'conflict',
        message: 'Cette adresse est deja utilisee.',
      });
    });

    it('refuse un pseudo deja pris (409)', async () => {
      const response = await t.http.post('/api/auth/register').send({
        email: 'autre@highfive.test',
        password: TEST_PASSWORD,
        username: 'alice',
      });
      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({
        message: 'Ce pseudo est deja pris.',
      });
    });
  });

  describe('connexion', () => {
    it('connecte avec les bons identifiants (casse de l email ignoree)', async () => {
      const response = await login(t, 'ALICE@highfive.test');
      expect(response.status).toBe(200);
      expect((response.body as { token: string }).token).toBeTruthy();
    });

    it('mauvais mot de passe : 401 et message FR unique', async () => {
      const response = await login(
        t,
        'alice@highfive.test',
        'mauvais-mot-de-passe',
      );
      expect(response.status).toBe(401);
      expect(response.body).toEqual({
        code: 'unauthorized',
        message: 'Adresse ou mot de passe incorrect.',
      });
    });

    it('compte inconnu : meme reponse que pour un mauvais mot de passe', async () => {
      const response = await login(t, 'inconnu@highfive.test');
      expect(response.status).toBe(401);
      expect((response.body as { message: string }).message).toBe(
        'Adresse ou mot de passe incorrect.',
      );
    });

    it('un compte supprime ne peut plus se connecter', async () => {
      const user = await registerUser(t, { prefix: 'supprime' });
      await t.dataSource.query(
        `UPDATE users SET deleted_at = now() WHERE id = $1`,
        [user.id],
      );
      const response = await login(t, user.email);
      expect(response.status).toBe(401);
    });
  });

  describe('sessions', () => {
    it('stocke le hachage du jeton, jamais le jeton en clair', async () => {
      const user = await registerUser(t, { prefix: 'hache' });
      const rows = await t.dataSource.query<{ token_hash: string }[]>(
        `SELECT token_hash FROM sessions WHERE user_id = $1`,
        [user.id],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].token_hash).toMatch(/^[0-9a-f]{64}$/);
      expect(rows[0].token_hash).not.toBe(user.token);
      const expected = createHash('sha256')
        .update(`pepper-de-test:${user.token}`)
        .digest('hex');
      expect(rows[0].token_hash).toBe(expected);

      const clair = await t.dataSource.query<unknown[]>(
        `SELECT 1 FROM sessions WHERE token_hash = $1`,
        [user.token],
      );
      expect(clair).toHaveLength(0);
    });

    it('GET /me renvoie la session courante', async () => {
      const user = await registerUser(t, { prefix: 'moi' });
      const response = await t.http.get('/api/me').set(authHeader(user.token));
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        id: user.id,
        username: user.username,
      });
    });

    it('la deconnexion invalide le jeton cote serveur (204 puis 401)', async () => {
      const user = await registerUser(t, { prefix: 'sortie' });
      const out = await t.http
        .post('/api/auth/logout')
        .set(authHeader(user.token));
      expect(out.status).toBe(204);

      const after = await t.http.get('/api/me').set(authHeader(user.token));
      expect(after.status).toBe(401);
      const rows = await t.dataSource.query<unknown[]>(
        `SELECT 1 FROM sessions WHERE user_id = $1`,
        [user.id],
      );
      expect(rows).toHaveLength(0);
    });

    it('la deconnexion n invalide que la session concernee', async () => {
      const user = await registerUser(t, { prefix: 'deux' });
      const second = await login(t, user.email);
      const otherToken = (second.body as { token: string }).token;
      await t.http.post('/api/auth/logout').set(authHeader(user.token));
      const still = await t.http.get('/api/me').set(authHeader(otherToken));
      expect(still.status).toBe(200);
    });

    it('un jeton inconnu est refuse (401, message FR)', async () => {
      const response = await t.http
        .get('/api/me')
        .set(authHeader('jeton-inconnu'));
      expect(response.status).toBe(401);
      expect(response.body).toEqual({
        code: 'unauthorized',
        message: 'Tu dois te connecter pour faire ca.',
      });
    });

    it('un schema d en-tete autre que Bearer est ignore (401)', async () => {
      const user = await registerUser(t, { prefix: 'basic' });
      const response = await t.http
        .get('/api/me')
        .set('Authorization', `Basic ${user.token}`);
      expect(response.status).toBe(401);
    });

    it('un jeton expire est refuse puis purge de la base', async () => {
      const user = await registerUser(t, { prefix: 'expire' });
      await t.dataSource.query(
        `UPDATE sessions SET expires_at = now() - interval '1 minute' WHERE user_id = $1`,
        [user.id],
      );
      const response = await t.http.get('/api/me').set(authHeader(user.token));
      expect(response.status).toBe(401);
      const rows = await t.dataSource.query<unknown[]>(
        `SELECT 1 FROM sessions WHERE user_id = $1`,
        [user.id],
      );
      expect(rows).toHaveLength(0);
    });

    it('le jeton d un compte supprime ne marche plus', async () => {
      const user = await registerUser(t, { prefix: 'efface' });
      await t.dataSource.query(
        `UPDATE users SET deleted_at = now() WHERE id = $1`,
        [user.id],
      );
      const response = await t.http.get('/api/me').set(authHeader(user.token));
      expect(response.status).toBe(401);
    });
  });

  describe('reinitialisation du mot de passe', () => {
    it('repond 204 que l adresse existe ou non (pas d enumeration)', async () => {
      const connu = await t.http
        .post('/api/auth/password-reset-request')
        .send({ email: 'alice@highfive.test' });
      const inconnu = await t.http
        .post('/api/auth/password-reset-request')
        .send({ email: 'personne@highfive.test' });
      expect(connu.status).toBe(204);
      expect(inconnu.status).toBe(204);
    });

    it('un jeton inconnu est refuse (400, message FR)', async () => {
      const response = await t.http
        .post('/api/auth/password-reset')
        .send({ token: 'nimporte-quoi', password: 'nouveau-mot-de-passe' });
      expect(response.status).toBe(400);
      expect((response.body as { message: string }).message).toBe(
        "Ce lien de reinitialisation n'est plus valable.",
      );
    });

    it('change le mot de passe, ferme les sessions ouvertes et est a usage unique', async () => {
      const user = await registerUser(t, { prefix: 'reset' });
      const token = 'jeton-de-reinitialisation-de-test';
      await t.dataSource.getRepository(PasswordResetTokenEntity).save({
        tokenHash: createHash('sha256').update(token).digest('hex'),
        userId: user.id,
        expiresAt: new Date(Date.now() + 60_000),
      });

      const ok = await t.http
        .post('/api/auth/password-reset')
        .send({ token, password: 'nouveau-mot-de-passe' });
      expect(ok.status).toBe(204);

      expect(
        (await t.http.get('/api/me').set(authHeader(user.token))).status,
      ).toBe(401);
      expect((await login(t, user.email, TEST_PASSWORD)).status).toBe(401);
      expect((await login(t, user.email, 'nouveau-mot-de-passe')).status).toBe(
        200,
      );

      const again = await t.http
        .post('/api/auth/password-reset')
        .send({ token, password: 'encore-un-autre-mdp' });
      expect(again.status).toBe(400);
    });

    it('refuse un jeton expire', async () => {
      const user = await registerUser(t, { prefix: 'resetexp' });
      const token = 'jeton-expire-de-test';
      await t.dataSource.getRepository(PasswordResetTokenEntity).save({
        tokenHash: createHash('sha256').update(token).digest('hex'),
        userId: user.id,
        expiresAt: new Date(Date.now() - 1000),
      });
      const response = await t.http
        .post('/api/auth/password-reset')
        .send({ token, password: 'nouveau-mot-de-passe' });
      expect(response.status).toBe(400);
    });
  });
});
