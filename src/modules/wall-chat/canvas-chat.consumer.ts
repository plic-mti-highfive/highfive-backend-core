import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Job } from 'bullmq';
import { IsNull, Repository } from 'typeorm';
import { ProjectEntity, WallEntity } from '../../entities/index.js';
import type { CanvasChatJobData } from '../wall/canvas.types.js';
import { CanvasClientService } from '../wall/canvas-client.service.js';
import { AssistantService } from './assistant/assistant.service.js';
import {
  ASSISTANT_USER_ID,
  CANVAS_CHAT_JOB,
  CANVAS_EVENTS_QUEUE,
} from './wall-chat.constants.js';
import { WallChatRepository } from './wall-chat.repository.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Consommateur de la file `canvas_events` (alimentee par highfive-backend-canvas).
 *
 * Pour chaque message du chat du Mur : sauvegarde (WallChatRepository),
 * puis, si l'assistant est sollicite, reponse du LLM sauvegardee et renvoyee
 * au canvas. Une erreur du LLM ou du canvas ne fait jamais echouer le job ;
 * seule une panne de base remonte, pour que BullMQ puisse le rejouer — sans
 * risque de doublon, l'`id` du message etant la cle d'idempotence.
 */
// La concurrence est lue a la declaration : voir CHAT_CONSUMER_CONCURRENCY.
@Processor(CANVAS_EVENTS_QUEUE, {
  concurrency: parseInt(process.env.CHAT_CONSUMER_CONCURRENCY ?? '5', 10),
})
export class CanvasChatConsumer extends WorkerHost {
  private readonly logger = new Logger(CanvasChatConsumer.name);

  constructor(
    @InjectRepository(WallEntity)
    private readonly walls: Repository<WallEntity>,
    @InjectRepository(ProjectEntity)
    private readonly projects: Repository<ProjectEntity>,
    private readonly chat: WallChatRepository,
    private readonly assistant: AssistantService,
    private readonly canvas: CanvasClientService,
  ) {
    super();
  }

  async process(job: Job<CanvasChatJobData>): Promise<void> {
    if (job.name !== CANVAS_CHAT_JOB) return;
    const data = job.data;

    if (!UUID.test(data.id) || !UUID.test(data.authorId)) {
      this.logger.warn(`Job ${job.id} ignore : identifiants invalides.`);
      return;
    }

    const wall = await this.walls.findOne({
      where: { canvasId: data.canvasId },
    });
    const project = wall
      ? await this.projects.findOne({
          where: { id: wall.projectId, deletedAt: IsNull() },
        })
      : null;
    if (!project) {
      this.logger.warn(
        `Message ${data.id} ignore : Mur ${data.canvasId} sans projet.`,
      );
      return;
    }

    const created = await this.chat.saveIfAbsent({
      id: data.id,
      projectId: project.id,
      canvasId: data.canvasId,
      authorId: data.authorId,
      role: 'user',
      body: data.text.slice(0, 4000),
      sentAt: new Date(data.timestamp),
    });
    // Job rejoue : tout a deja ete fait (et la reponse deja donnee).
    if (!created) return;

    if (data.authorId === ASSISTANT_USER_ID) return;
    if (!this.assistant.shouldReply(data.text)) return;

    const reply = await this.assistant.reply(project, data.canvasId);
    const delivered = await this.canvas.postChatMessage(data.canvasId, {
      id: reply.id,
      text: reply.text,
      authorId: ASSISTANT_USER_ID,
      timestamp: reply.timestamp,
      isAssistant: true,
    });
    if (!delivered) {
      this.logger.warn(
        `Reponse ${reply.id} sauvegardee mais non diffusee dans le Mur ${data.canvasId}.`,
      );
    }
  }
}
