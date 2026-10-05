import type { ChatTurn } from './context.js';

/**
 * Fournisseur de LLM de l'assistant du chat. Implementations selectionnees par
 * `LLM_PROVIDER` (voir `llm.service.ts`). Seul `fake` existe pour l'instant.
 */
export interface LlmProvider {
  /** Doit rejeter apres `timeoutMs` ; la politique de retry est celle de l'appelant. */
  generate(
    messages: ChatTurn[],
    options: { timeoutMs: number },
  ): Promise<string>;
}

/** Reponse non reessayable (requete refusee) : l'appelant n'insiste pas. */
export class LlmPermanentError extends Error {}
