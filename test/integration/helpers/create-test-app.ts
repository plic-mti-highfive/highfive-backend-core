import type { INestApplication } from '@nestjs/common';
import { getOptionsToken } from '@nestjs/throttler';
import { Test } from '@nestjs/testing';
import { randomBytes } from 'node:crypto';
import { Client } from 'pg';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { inject } from 'vitest';
import type { CanvasExport } from '../../../src/modules/wall/canvas.types.js';
import * as entities from '../../../src/entities/index.js';

export const ADMIN_EMAIL = 'admin@highfive.test';
export const TEST_PASSWORD = 'motdepasse-de-test';

export interface TestApp {
  app: INestApplication;
  /** Client HTTP lie a l'application (sans port reseau). */
  http: ReturnType<typeof request>;
  dataSource: DataSource;
  /** Faux client canvas : renseigner `exportResult` pour simuler un Mur. */
  canvas: FakeCanvasClientService;
  /** Nom de la base jetable de ce fichier de test. */
  databaseName: string;
  /** Arrete l'application et SUPPRIME la base du fichier. */
  close: () => Promise<void>;
}

/** Remplace le stockage objet : aucune requete S3/MinIO dans les tests. */
class FakeStorageService {
  async onModuleInit(): Promise<void> {}
  read(): Promise<Buffer> {
    return Promise.resolve(Buffer.alloc(0));
  }
  put(folder: string, name: string) {
    const key = `${folder}/${name}`;
    return Promise.resolve({ key, url: `http://storage.test/${key}` });
  }
  async putAt(): Promise<void> {}
  async remove(): Promise<void> {}
  removePrefix(): Promise<number> {
    return Promise.resolve(0);
  }
  urlFor(key: string): string {
    return `http://storage.test/${key}`;
  }
  signedUrlFor(key: string): Promise<string> {
    return Promise.resolve(`http://storage.test/${key}?signed=1`);
  }
  stableSignedUrlFor(key: string): Promise<string> {
    return Promise.resolve(`http://storage.test/${key}?signed=1`);
  }
}

/**
 * Le service canvas n'existe pas dans les tests : par defaut export vide
 * (injoignable), envoi ignore. `exportResult` permet a un test de simuler un
 * Mur rempli.
 */
export class FakeCanvasClientService {
  exportResult: CanvasExport | null = null;
  fetchExport(): Promise<CanvasExport | null> {
    return Promise.resolve(this.exportResult);
  }
  postChatMessage(): Promise<void> {
    return Promise.resolve();
  }
}

/** Le service IA HTTP n'existe pas dans les tests : aucune recommandation. */
class FakeAiRecommendationsService {
  projectsForUser(): Promise<string[]> {
    return Promise.resolve([]);
  }
  usersForProject(): Promise<string[]> {
    return Promise.resolve([]);
  }
  trendingProjects(): Promise<string[]> {
    return Promise.resolve([]);
  }
}

/**
 * Demarre le VRAI `AppModule` sur une base PostgreSQL creee pour ce fichier
 * (`hf_test_<aleatoire>`), supprimee par `close()`. Seules les dependances
 * externes (stockage objet, canvas, service IA HTTP) sont remplacees ; le LLM
 * est le fournisseur `fake`, deterministe.
 */
export async function createTestApp(): Promise<TestApp> {
  const adminUrl = inject('testDatabaseUrl');
  const redisUrl = new URL(inject('testRedisUrl'));
  const databaseName = `hf_test_${randomBytes(6).toString('hex')}`;

  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(`CREATE DATABASE "${databaseName}"`);

  const url = new URL(adminUrl);
  Object.assign(process.env, {
    NODE_ENV: 'test',
    DB_HOST: url.hostname,
    DB_PORT: url.port || '5432',
    DB_USERNAME: decodeURIComponent(url.username),
    DB_PASSWORD: decodeURIComponent(url.password),
    DB_DATABASE: databaseName,
    REDIS_HOST: redisUrl.hostname,
    REDIS_PORT: redisUrl.port || '6379',
    ADMIN_EMAILS: ADMIN_EMAIL,
    SESSION_TOKEN_PEPPER: 'pepper-de-test',
    CANVAS_JWT_SECRET: 'canvas-secret-de-test',
    CANVAS_INTERNAL_SECRET: 'canvas-interne-de-test',
    AI_JWT_SECRET: 'ai-secret-de-test',
    LLM_PROVIDER: 'fake',
  });

  // Le DatabaseModule ne synchronise qu'en developpement, et certains
  // services (themes) ecrivent des l'initialisation : le schema doit donc
  // exister avant le demarrage de l'application.
  const schema = new DataSource({
    type: 'postgres',
    url: `${adminUrl.slice(0, adminUrl.lastIndexOf('/'))}/${databaseName}`,
    entities: Object.values(entities),
  });
  await schema.initialize();
  await schema.synchronize();
  await schema.destroy();

  // Importe apres la mise en place de l'environnement : la configuration est
  // lue a l'evaluation du module.
  const { AppModule } = await import('../../../src/app.module.js');
  const { StorageService } =
    await import('../../../src/common/storage/storage.service.js');
  const { CanvasClientService } =
    await import('../../../src/modules/wall/canvas-client.service.js');
  const { AiRecommendationsService } =
    await import('../../../src/common/ai/ai-recommendations.service.js');
  const { ApiExceptionFilter } =
    await import('../../../src/common/errors/api-exception.filter.js');

  const canvas = new FakeCanvasClientService();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(StorageService)
    .useValue(new FakeStorageService())
    .overrideProvider(CanvasClientService)
    .useValue(canvas)
    .overrideProvider(AiRecommendationsService)
    .useValue(new FakeAiRecommendationsService())
    // Limitation de debit relevee : les tests enchainent des centaines d'appels.
    .overrideProvider(getOptionsToken())
    .useValue([{ ttl: 60_000, limit: 1_000_000 }])
    .compile();

  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api', { exclude: ['api/docs'] });
  app.useGlobalFilters(new ApiExceptionFilter());
  await app.init();

  // L'entretien periodique demarre en tache de fond a l'initialisation : on
  // le laisse finir avant de rendre la main, sans quoi la suppression de la
  // base en fin de fichier couperait une requete en cours.
  const { MaintenanceService } =
    await import('../../../src/modules/maintenance/maintenance.service.js');
  await app.get(MaintenanceService).run();

  const dataSource = app.get(DataSource);

  return {
    app,
    http: request(app.getHttpServer() as Parameters<typeof request>[0]),
    dataSource,
    canvas,
    databaseName,
    close: async () => {
      try {
        await app.close();
      } finally {
        await admin.query(
          `DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`,
        );
        await admin.end();
      }
    },
  };
}
