import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { AI_QUEUES } from './ai.constants.js';
import { AiEventsService } from './ai-events.service.js';
import { AiRecommendationsService } from './ai-recommendations.service.js';

/**
 * Frontiere `api -> ai` (SPEC.md §5, `22-PLAN-DE-BASCULE.md` §4). Le front ne
 * parle jamais au service IA : tout passe par ici.
 *
 * Deux canaux, et deux seulement :
 *  - une file BullMQ pour nourrir les embeddings (`AiEventsService`) ;
 *  - un appel HTTP de lecture pour les recommandations (`AiRecommendationsService`).
 *
 * Le service IA n'a pas ete modifie : c'est le core qui s'adapte a son
 * contrat (`docs/redis-contract.md` du depot `highfive-backend-ai`), y compris
 * pour le `tenant_id` qu'il exige encore.
 */
@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('redis.host'),
          port: config.get<number>('redis.port'),
        },
      }),
    }),
    BullModule.registerQueue(
      { name: AI_QUEUES.AI_TASKS },
      { name: AI_QUEUES.FAST_EVENTS },
    ),
  ],
  providers: [AiEventsService, AiRecommendationsService],
  exports: [AiEventsService, AiRecommendationsService],
})
export class AiModule {}
