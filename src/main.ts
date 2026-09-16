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
    const root = process.cwd();
    const raw = readFileSync(join(root, 'openapi.yaml'), 'utf8');
    const document = parse(raw) as OpenAPIObject;
    inlineExternalSchemas(document, root);
    SwaggerModule.setup('api/docs', app, document);
  } catch (error) {
    Logger.warn(
      `Contrat openapi.yaml illisible, documentation non servie: ${String(error)}`,
      'Bootstrap',
    );
  }
}

/**
 * `components.schemas` ne contient que des renvois vers `./schemas/*.json`,
 * le bundle exporte depuis les schemas zod du front. Swagger UI tourne dans
 * le navigateur : laisses tels quels, ces chemins relatifs seraient resolus
 * contre `/api/docs` et demanderaient des fichiers que l'API ne sert pas.
 * On les remplace donc par leur contenu au chargement, une fois, pour que le
 * document servi soit autonome.
 */
function inlineExternalSchemas(document: OpenAPIObject, root: string): void {
  const schemas = document.components?.schemas;
  if (!schemas) return;

  for (const [name, value] of Object.entries(schemas)) {
    const ref = (value as { $ref?: string }).$ref;
    if (!ref?.startsWith('./schemas/')) continue;

    try {
      schemas[name] = JSON.parse(
        readFileSync(join(root, ref), 'utf8'),
      ) as (typeof schemas)[string];
    } catch (error) {
      // Un schema manquant ne doit pas priver de toute la documentation : on
      // laisse le renvoi en place et on signale lequel.
      Logger.warn(
        `Schema « ${name} » introuvable (${ref}): ${String(error)}`,
        'Bootstrap',
      );
    }
  }
}

void bootstrap();
