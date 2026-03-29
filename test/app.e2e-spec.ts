import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { DataSource } from 'typeorm';

/**
 * E2E tests require a running Postgres instance.
 * Set env vars DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD, DB_DATABASE
 * pointing to a test database before running.
 *
 * Run with: npm run test:e2e
 */
describe('HighFive! Core API (e2e)', () => {
  let app: INestApplication<App>;
  let tenantId: string;
  let accessToken: string;
  let refreshToken: string;
  let userId: string;
  let projectId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    const dataSource = app.get(DataSource);
    if (dataSource.isInitialized) {
      await dataSource.query(
        `DO $$ DECLARE r RECORD; BEGIN FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP EXECUTE 'TRUNCATE TABLE ' || quote_ident(r.tablename) || ' CASCADE'; END LOOP; END $$;`,
      );
    }
    await app.close();
  });

  describe('Tenant setup', () => {
    it('POST /tenants — create tenant', async () => {
      const res = await request(app.getHttpServer())
        .post('/tenants')
        .send({ name: 'Test School', domain: 'test.highfive.app' })
        .expect(201);

      tenantId = res.body.id;
      expect(tenantId).toBeDefined();
    });
  });

  describe('Auth flow', () => {
    it('POST /auth/register', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .set('X-Tenant-ID', tenantId)
        .send({ email: 'alice@test.fr', password: 'SecureP@ss123' })
        .expect(201);

      accessToken = res.body.accessToken;
      refreshToken = res.body.refreshToken;
      expect(accessToken).toBeDefined();
      expect(refreshToken).toBeDefined();
    });

    it('POST /auth/login', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .set('X-Tenant-ID', tenantId)
        .send({ email: 'alice@test.fr', password: 'SecureP@ss123' })
        .expect(201);

      accessToken = res.body.accessToken;
      refreshToken = res.body.refreshToken;
    });

    it('GET /auth/me', async () => {
      const res = await request(app.getHttpServer())
        .get('/auth/me')
        .set('X-Tenant-ID', tenantId)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      userId = res.body.id;
      expect(res.body.email).toBe('alice@test.fr');
    });

    it('POST /auth/refresh', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('X-Tenant-ID', tenantId)
        .send({ refreshToken })
        .expect(201);

      accessToken = res.body.accessToken;
      refreshToken = res.body.refreshToken;
      expect(accessToken).toBeDefined();
    });

    it('should reject missing X-Tenant-ID', async () => {
      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(400);
    });
  });

  describe('Projects flow', () => {
    it('POST /projects — create', async () => {
      const res = await request(app.getHttpServer())
        .post('/projects')
        .set('X-Tenant-ID', tenantId)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'E2E Project', description: 'Test project' })
        .expect(201);

      projectId = res.body.id;
      expect(res.body.name).toBe('E2E Project');
    });

    it('GET /projects — list', async () => {
      const res = await request(app.getHttpServer())
        .get('/projects')
        .set('X-Tenant-ID', tenantId)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.total).toBeGreaterThanOrEqual(1);
    });

    it('PATCH /projects/:id — update', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/projects/${projectId}`)
        .set('X-Tenant-ID', tenantId)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Updated Project' })
        .expect(200);

      expect(res.body.name).toBe('Updated Project');
    });
  });

  describe('Tickets flow', () => {
    let ticketId: string;

    it('POST /projects/:id/tickets — create', async () => {
      const res = await request(app.getHttpServer())
        .post(`/projects/${projectId}/tickets`)
        .set('X-Tenant-ID', tenantId)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ title: 'E2E Ticket' })
        .expect(201);

      ticketId = res.body.id;
      expect(res.body.title).toBe('E2E Ticket');
    });

    it('PATCH /projects/:id/tickets/:ticketId — assign to self', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/projects/${projectId}/tickets/${ticketId}`)
        .set('X-Tenant-ID', tenantId)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ assigneeId: userId, status: 'IN_PROGRESS' })
        .expect(200);

      expect(res.body.assigneeId).toBe(userId);
      expect(res.body.status).toBe('IN_PROGRESS');
    });

    it('GET /projects/:id/tickets — list', async () => {
      const res = await request(app.getHttpServer())
        .get(`/projects/${projectId}/tickets`)
        .set('X-Tenant-ID', tenantId)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.total).toBeGreaterThanOrEqual(1);
    });
  });
});
