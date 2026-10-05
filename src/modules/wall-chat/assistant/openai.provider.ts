import OpenAI from 'openai';
import { LlmPermanentError, type LlmProvider } from './llm-provider.js';
import type { ChatTurn } from './context.js';

/** Fournisseur reel : SDK `openai`, cle et modele issus de l'environnement. */
export class OpenAiLlmProvider implements LlmProvider {
  private readonly client: OpenAI;

  constructor(
    apiKey: string,
    private readonly model: string,
  ) {
    this.client = new OpenAI({ apiKey });
  }

  async generate(
    messages: ChatTurn[],
    options: { timeoutMs: number },
  ): Promise<string> {
    try {
      const response = await this.client.chat.completions.create(
        { model: this.model, temperature: 0.4, messages },
        // Les tentatives sont comptees par LlmService, une seule fois.
        { timeout: options.timeoutMs, maxRetries: 0 },
      );
      return response.choices[0]?.message?.content ?? '';
    } catch (error) {
      const status = (error as { status?: number }).status;
      // 4xx hors 408/429 : rejouer ne changera rien (cle invalide, requete refusee).
      if (
        status &&
        status >= 400 &&
        status < 500 &&
        status !== 408 &&
        status !== 429
      ) {
        throw new LlmPermanentError(String(error));
      }
      throw error;
    }
  }
}
