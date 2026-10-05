import { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';
import { LlmPermanentError, type LlmProvider } from './llm-provider.js';
import { LlmService, LlmUnavailableError } from './llm.service.js';

const turns = [{ role: 'user' as const, content: 'x' }];

const make = (provider: LlmProvider, values: Record<string, unknown> = {}) => {
  const service = new LlmService({
    get: (key: string) => values[key],
  } as unknown as ConfigService);
  const sleeps: number[] = [];
  service.sleep = (ms) => {
    sleeps.push(ms);
    return Promise.resolve();
  };
  (service as unknown as { provider: LlmProvider }).provider = provider;
  return { service, sleeps };
};

describe('LlmService : erreurs, retries et delai', () => {
  it('reessaie avec backoff exponentiel puis reussit', async () => {
    const generate = vi
      .fn()
      .mockRejectedValueOnce(new Error('503'))
      .mockRejectedValueOnce(new Error('503'))
      .mockResolvedValue('  ok  ');
    const { service, sleeps } = make(
      { generate },
      { 'assistant.maxRetries': 2 },
    );
    expect(await service.complete(turns)).toBe('ok');
    expect(generate).toHaveBeenCalledTimes(3);
    expect(sleeps).toEqual([500, 1000]);
  });

  it('abandonne apres maxRetries + 1 tentatives avec une erreur francaise', async () => {
    const generate = vi.fn().mockRejectedValue(new Error('503'));
    const { service } = make({ generate }, { 'assistant.maxRetries': 1 });
    await expect(service.complete(turns)).rejects.toBeInstanceOf(
      LlmUnavailableError,
    );
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it('ne reessaie pas une erreur permanente (4xx)', async () => {
    const generate = vi.fn().mockRejectedValue(new LlmPermanentError('401'));
    const { service, sleeps } = make(
      { generate },
      { 'assistant.maxRetries': 3 },
    );
    await expect(service.complete(turns)).rejects.toBeInstanceOf(
      LlmUnavailableError,
    );
    expect(generate).toHaveBeenCalledTimes(1);
    expect(sleeps).toEqual([]);
  });

  it('un provider qui ne repond pas est coupe au timeout', async () => {
    const generate = vi.fn(() => new Promise<string>(() => undefined));
    const { service } = make(
      { generate },
      { 'assistant.timeoutMs': 30, 'assistant.maxRetries': 1 },
    );
    const start = Date.now();
    await expect(service.complete(turns)).rejects.toBeInstanceOf(
      LlmUnavailableError,
    );
    expect(generate).toHaveBeenCalledTimes(2);
    expect(Date.now() - start).toBeLessThan(1000);
  });

  it('transmet le timeout au provider', async () => {
    const generate = vi.fn().mockResolvedValue('ok');
    const { service } = make({ generate }, { 'assistant.timeoutMs': 1234 });
    await service.complete(turns);
    expect(generate).toHaveBeenCalledWith(turns, { timeoutMs: 1234 });
  });

  it('une reponse vide est une erreur (puis reessayee)', async () => {
    const generate = vi.fn().mockResolvedValue('   ');
    const { service } = make({ generate }, { 'assistant.maxRetries': 1 });
    await expect(service.complete(turns)).rejects.toBeInstanceOf(
      LlmUnavailableError,
    );
    expect(generate).toHaveBeenCalledTimes(2);
  });
});
