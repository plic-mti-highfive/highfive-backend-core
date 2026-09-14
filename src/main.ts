import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import helmet from 'helmet';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { AppModule } from './app.module.js';
import { ApiExceptionFilter } from './common/errors/api-exception.filter.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const port = config.get<number>('port', 3000);

  /*
   * Toutes les routes sont prefixees `/api` (SPEC.md §1.1, `src/api/client.ts`
   * cote front). Le prefixe vit ici, une fois, plutot que dans chaque
   * controleur.
   */
  app.setGlobalPrefix('api', { exclude: ['api/docs'] });

  const origins = config.get<string>('corsOrigins', '*');
  app.enableCors({
    origin: origins === '*' ? true : origins.split(',').map((o) => o.trim()),
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // `crossOriginResourcePolicy` desactive : le front est servi depuis une
  // autre origine en developpement et doit pouvoir lire les reponses.
  app.use(helmet({ crossOriginResourcePolicy: false }));

  /*
   * Pas de pipe de validation global : les corps sont valides par les schemas
   * zod du contrat (`ZodBody`), les parametres de route par les pipes poses
   * route par route (`ParseUUIDPipe`). Un `ValidationPipe` en plus exigerait
   * `class-validator` pour ne rien valider de plus.
   */
  app.useGlobalFilters(new ApiExceptionFilter());

  mountOpenApi(app);

  await app.listen(port);
  Logger.log(`API disponible sur http://localhost:${port}/api`, 'Bootstrap');
}

/**
 * La documentation servie est le contrat lui-meme (`openapi.yaml`, genere
 * depuis les schemas zod du front), pas un document reconstruit a partir de
 * decorateurs : deux sources se seraient inevitablement contredites.
 */
function mountOpenApi(app: Parameters<typeof SwaggerModule.setup>[1]): void {
  try {
    const raw = readFileSync(join(process.cwd(), 'openapi.yaml'), 'utf8');
    SwaggerModule.setup('api/docs', app, parse(raw) as OpenAPIObject);
  } catch (error) {
    Logger.warn(
      `Contrat openapi.yaml illisible, documentation non servie: ${String(error)}`,
      'Bootstrap',
    );
  }
}

void bootstrap();
