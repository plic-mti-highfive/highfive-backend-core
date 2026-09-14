import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { AI_INTERACTIONS, AI_JOBS, AI_QUEUES } from './ai.constants.js';

/**
 * Alimente les embeddings du service IA.
 *
 * Rien de ce qui se passe ici ne doit faire echouer la requete qui l'a
 * declenche : si Redis est indisponible, un projet doit quand meme se creer.
 * Les jobs sont donc emis en « au mieux », et l'echec est journalise.
 *
 * R-IA-23 : rien de prive ne part vers l'IA — seuls titre, description et
 * themes d'un projet public, bio et interets d'une personne.
 */
@Injectable()
export class AiEventsService {
  private readonly logger = new Logger(AiEventsService.name);
  private readonly tenantId: string;

  constructor(
    @InjectQueue(AI_QUEUES.AI_TASKS) private readonly aiTasks: Queue,
    @InjectQueue(AI_QUEUES.FAST_EVENTS) private readonly fastEvents: Queue,
    config: ConfigService,
  ) {
    this.tenantId = config.get<string>('ai.tenantId')!;
  }

  async userIdentityChanged(input: {
    userId: string;
    bio?: string | null;
    interests: string[];
  }): Promise<void> {
    await this.enqueue(this.aiTasks, AI_JOBS.UPDATE_USER_IDENTITY, {
      tenant_id: this.tenantId,
      user_id: input.userId,
      payload: { bio: input.bio ?? undefined, skills: input.interests },
    });
  }

  async projectIdentityChanged(input: {
    projectId: string;
    title: string;
    description?: string | null;
    tags: string[];
    visibility: string;
  }): Promise<void> {
    // Un projet prive n'a rien a faire dans un index de recommandation.
    if (input.visibility !== 'public') return;

    await this.enqueue(this.aiTasks, AI_JOBS.UPDATE_PROJECT_IDENTITY, {
      tenant_id: this.tenantId,
      project_id: input.projectId,
      payload: {
        name: input.title,
        description: input.description ?? undefined,
        tags: input.tags,
        visibility: input.visibility,
      },
    });
  }

  async userInteracted(input: {
    userId: string;
    projectId: string;
    kind: 'like' | 'apply';
  }): Promise<void> {
    await this.enqueue(this.fastEvents, AI_JOBS.USER_INTERACTED_WITH_PROJECT, {
      tenant_id: this.tenantId,
      user_id: input.userId,
      project_id: input.projectId,
      interaction_type:
        input.kind === 'like' ? AI_INTERACTIONS.LIKE : AI_INTERACTIONS.APPLY,
    });
  }

  async projectStatsChanged(input: {
    projectId: string;
    highfiveCount: number;
  }): Promise<void> {
    await this.enqueue(this.fastEvents, AI_JOBS.PROJECT_STATS_UPDATED, {
      tenant_id: this.tenantId,
      project_id: input.projectId,
      likes: input.highfiveCount,
    });
  }

  private async enqueue(
    queue: Queue,
    name: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    try {
      await queue.add(name, data);
    } catch (error) {
      this.logger.warn(`Job IA ${name} non emis: ${String(error)}`);
    }
  }
}
