import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import type { ChatTurn } from './context.js';
import { LlmService, LlmUnavailableError } from './llm.service.js';

const turns: ChatTurn[] = [
  { role: 'system', content: 'sys' },
  { role: 'user', content: 'Alice : a' },
  { role: 'user', content: 'Bob : @ia bonjour' },
];

const make = (values: Record<string, unknown>) => {
  const service = new LlmService({
    get: (key: string) => values[key],
  } as unknown as ConfigService);
  service.sleep = () => Promise.resolve();
  return service;
};

describe('LlmService', () => {
  it('fake : reponse deterministe avec le nombre de messages de contexte', async () => {
    const service = make({ 'assistant.provider': 'fake' });
    const a = await service.complete(turns);
    expect(a).toContain('Contexte : 2 message(s)');
    expect(a).toContain('@ia bonjour');
    expect(await service.complete(turns)).toBe(a);
  });

  it('fournisseur inconnu : erreur francaise, sans crash', async () => {
    const service = make({ 'assistant.provider': 'inconnu' });
    await expect(service.complete(turns)).rejects.toBeInstanceOf(
      LlmUnavailableError,
    );
  });
});
