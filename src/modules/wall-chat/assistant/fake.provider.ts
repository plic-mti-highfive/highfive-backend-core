import type { ChatTurn } from './context.js';
import type { LlmProvider } from './llm-provider.js';

/**
 * Reponse deterministe, sans reseau : donne le nombre de messages de contexte
 * recus et rappelle le dernier, de quoi verifier la contextualisation en test
 * et en e2e.
 */
export class FakeLlmProvider implements LlmProvider {
  generate(messages: ChatTurn[]): Promise<string> {
    const history = messages.filter((turn) => turn.role !== 'system');
    const last = history.at(-1)?.content ?? '';
    const excerpt = last.length > 120 ? `${last.slice(0, 120)}...` : last;
    return Promise.resolve(
      `[assistant simule] Contexte : ${history.length} message(s). Dernier message : « ${excerpt} »`,
    );
  }
}
