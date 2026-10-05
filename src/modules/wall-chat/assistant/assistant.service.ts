import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ProjectEntity, UserEntity } from '../../../entities/index.js';
import {
  ASSISTANT_MENTION,
  ASSISTANT_USER_ID,
} from '../wall-chat.constants.js';
import { WallChatRepository } from '../wall-chat.repository.js';
import { buildContext, type HistoryMessage } from './context.js';
import { LlmService, LlmUnavailableError } from './llm.service.js';

const FALLBACK_REPLY =
  "Desole, je n'ai pas pu repondre : l'assistant IA a rencontre une erreur. Reessaie dans un instant.";

export interface AssistantReply {
  id: string;
  text: string;
  timestamp: number;
  /** Vrai quand le texte est un message d'erreur, pas une reponse du LLM. */
  failed: boolean;
}

/**
 * Assistant du chat : decide s'il doit repondre, construit le contexte,
 * appelle le LLM et sauvegarde la reponse.
 */
@Injectable()
export class AssistantService {
  private readonly logger = new Logger(AssistantService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly chat: WallChatRepository,
    private readonly llm: LlmService,
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
  ) {}

  /**
   * `mention` (defaut) : seulement les messages qui contiennent `@ia`, pour ne
   * pas faire payer un appel LLM a chaque phrase d'une discussion entre
   * humains. `all` : tous les messages.
   */
  shouldReply(text: string): boolean {
    const trigger = this.config.get<string>('assistant.trigger') ?? 'mention';
    return trigger === 'all' || ASSISTANT_MENTION.test(text);
  }

  /**
   * Ne leve jamais pour une erreur du LLM : elle devient un message d'erreur
   * en francais, sauvegarde comme reponse pour que l'equipe voie ce qui se
   * passe. Seule une panne de base remonte (le job pourra etre rejoue).
   */
  async reply(
    project: ProjectEntity,
    canvasId: string,
    replyId: string = crypto.randomUUID(),
  ): Promise<AssistantReply> {
    const limit = this.config.get<number>('assistant.contextMaxMessages') ?? 50;
    const budget =
      this.config.get<number>('assistant.contextTokenBudget') ?? 3000;

    const recent = await this.chat.recent(project.id, limit);
    const authorIds = [
      ...new Set(
        recent.filter((m) => m.role === 'user').map((m) => m.authorId),
      ),
    ];
    const authors = authorIds.length
      ? await this.users.find({ where: { id: In(authorIds) } })
      : [];
    const names = new Map(
      authors.map((user) => [user.id, user.displayName ?? user.username]),
    );

    const history: HistoryMessage[] = recent.map((message) => ({
      authorName: names.get(message.authorId) ?? 'Membre',
      isAssistant: message.role === 'assistant',
      body: message.body,
    }));

    const context = buildContext(history, {
      project: {
        title: project.title,
        description: project.description ?? undefined,
      },
      budgetTokens: budget,
      maxMessages: limit,
    });
    this.logger.log(
      `Contexte assistant : ${context.messageCount} message(s) garde(s), ${context.droppedCount} ecarte(s).`,
    );

    let text: string;
    let failed = false;
    try {
      text = await this.llm.complete(context.turns);
    } catch (error) {
      failed = true;
      text =
        error instanceof LlmUnavailableError ? error.message : FALLBACK_REPLY;
      this.logger.error(`Assistant en echec : ${String(error)}`);
    }

    const message = {
      id: replyId,
      projectId: project.id,
      canvasId,
      authorId: ASSISTANT_USER_ID,
      role: 'assistant' as const,
      body: text.slice(0, 4000),
      sentAt: new Date(),
    };
    await this.chat.saveIfAbsent(message);
    return {
      id: message.id,
      text: message.body,
      timestamp: message.sentAt.getTime(),
      failed,
    };
  }
}
