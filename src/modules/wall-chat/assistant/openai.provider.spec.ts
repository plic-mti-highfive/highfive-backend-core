import { beforeEach, describe, expect, it, vi } from 'vitest';

const create = vi.fn();
vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create } };
  },
}));

import { LlmPermanentError } from './llm-provider.js';
import { OpenAiLlmProvider } from './openai.provider.js';

const turns = [
  { role: 'system' as const, content: 's' },
  { role: 'user' as const, content: 'u' },
];

class ApiError extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`);
  }
}

describe('OpenAiLlmProvider (SDK mocke, aucun reseau)', () => {
  beforeEach(() => {
    create.mockReset();
  });

  it('envoie le modele, les messages et le timeout, sans retry SDK', async () => {
    create.mockResolvedValue({ choices: [{ message: { content: 'salut' } }] });
    const out = await new OpenAiLlmProvider('k', 'm').generate(turns, {
      timeoutMs: 99,
    });
    expect(out).toBe('salut');
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'm', messages: turns }),
      { timeout: 99, maxRetries: 0 },
    );
  });

  it('contenu absent -> chaine vide', async () => {
    create.mockResolvedValue({ choices: [] });
    expect(
      await new OpenAiLlmProvider('k', 'm').generate(turns, { timeoutMs: 1 }),
    ).toBe('');
  });

  it.each([400, 401, 404])('HTTP %i -> erreur permanente', async (status) => {
    create.mockImplementation(() => {
      throw new ApiError(status);
    });
    const err = await new OpenAiLlmProvider('k', 'm')
      .generate(turns, { timeoutMs: 1 })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LlmPermanentError);
  });

  it.each([408, 429, 500, 503])(
    'HTTP %i -> erreur reessayable',
    async (status) => {
      const error = new ApiError(status);
      create.mockImplementation(() => {
        throw error;
      });
      const err = await new OpenAiLlmProvider('k', 'm')
        .generate(turns, { timeoutMs: 1 })
        .catch((e: unknown) => e);
      expect(err).toBe(error);
    },
  );
});
