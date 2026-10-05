import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ChatTurn } from './context.js';
import { FakeLlmProvider } from './fake.provider.js';
import { OpenAiLlmProvider } from './openai.provider.js';
import { LlmPermanentError, type LlmProvider } from './llm-provider.js';

/** Levee quand le LLM reste inaccessible apres les tentatives autorisees. */
export class LlmUnavailableError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'LlmUnavailableError';
  }
}

/** Delai plafond d'un appel, applique ici pour tous les fournisseurs. */
const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Delai de ${ms} ms depasse.`)),
      ms,
    );
    promise.then(resolve, reject).finally(() => clearTimeout(timer));
  });

/**
 * Appel au LLM choisi par `LLM_PROVIDER`, derriere un delai et un nombre de
 * tentatives bornes.
 */
@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  private provider?: LlmProvider;

  /** Surchargeable dans les tests pour ne pas attendre le backoff. */
  sleep: (ms: number) => Promise<void> = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms));

  constructor(private readonly config: ConfigService) {}

  private getProvider(): LlmProvider {
    if (this.provider) return this.provider;
    const name = this.config.get<string>('assistant.provider') ?? 'fake';
    if (name === 'fake') {
      this.provider = new FakeLlmProvider();
      return this.provider;
    }
    if (name === 'openai') {
      const apiKey = this.config.get<string>('assistant.openaiApiKey');
      if (!apiKey) {
        throw new LlmUnavailableError(
          "L'assistant IA n'est pas configure sur ce serveur (cle OpenAI absente).",
        );
      }
      this.provider = new OpenAiLlmProvider(
        apiKey,
        this.config.get<string>('openai.model') ?? 'gpt-4o-mini',
      );
      return this.provider;
    }
    throw new LlmUnavailableError(
      `Le fournisseur d'IA « ${name} » n'est pas disponible sur ce serveur.`,
    );
  }

  async complete(turns: ChatTurn[]): Promise<string> {
    // Lever ici (hors boucle) : une config manquante ne se reessaie pas.
    const provider = this.getProvider();
    const timeoutMs = this.config.get<number>('assistant.timeoutMs') ?? 20000;
    const retries = Math.max(
      0,
      this.config.get<number>('assistant.maxRetries') ?? 0,
    );
    let lastError: unknown;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const text = (
          await withTimeout(provider.generate(turns, { timeoutMs }), timeoutMs)
        ).trim();
        if (!text) throw new Error('Reponse du LLM vide.');
        return text;
      } catch (error) {
        lastError = error;
        this.logger.warn(
          `Appel LLM en echec (tentative ${attempt + 1}/${retries + 1}) : ${String(error)}`,
        );
        if (error instanceof LlmPermanentError || attempt === retries) break;
        await this.sleep(500 * 2 ** attempt);
      }
    }

    throw new LlmUnavailableError(
      "L'assistant IA est momentanement indisponible. Reessaie dans un instant.",
      lastError,
    );
  }
}
