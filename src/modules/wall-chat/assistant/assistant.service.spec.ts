/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/unbound-method -- mocks de test */
import { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';
import type { Repository } from 'typeorm';
import type { ProjectEntity, UserEntity } from '../../../entities/index.js';
import { ASSISTANT_USER_ID } from '../wall-chat.constants.js';
import type {
  WallChatMessage,
  WallChatRepository,
} from '../wall-chat.repository.js';
import { AssistantService } from './assistant.service.js';
import { LlmService, LlmUnavailableError } from './llm.service.js';

const uuid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const project = {
  id: uuid(1),
  title: 'Projet Test',
  description: 'Une description',
} as ProjectEntity;

const msg = (
  n: number,
  body: string,
  role: 'user' | 'assistant' = 'user',
  authorId = uuid(100),
): WallChatMessage => ({
  id: uuid(n),
  projectId: project.id,
  canvasId: uuid(2),
  authorId,
  role,
  body,
  sentAt: new Date(n),
});

const setup = (
  values: Record<string, unknown> = {},
  history: WallChatMessage[] = [],
  complete: () => Promise<string> = () => Promise.resolve('reponse'),
) => {
  const saved: WallChatMessage[] = [];
  const chat = {
    recent: vi.fn().mockResolvedValue(history),
    saveIfAbsent: vi.fn((m: WallChatMessage) => {
      saved.push(m);
      return Promise.resolve(true);
    }),
  } as unknown as WallChatRepository;
  const llm = { complete: vi.fn(complete) } as unknown as LlmService;
  const users = {
    find: vi
      .fn()
      .mockResolvedValue([
        { id: uuid(100), displayName: 'Alice', username: 'alice' },
      ]),
  } as unknown as Repository<UserEntity>;
  const service = new AssistantService(
    { get: (k: string) => values[k] } as unknown as ConfigService,
    chat,
    llm,
    users,
  );
  return { service, chat, llm, saved };
};

describe('AssistantService.shouldReply (declencheur @ia)', () => {
  const { service } = setup();
  it.each([
    ['@ia fais un resume', true],
    ['salut @ia', true],
    ['Dis donc, @IA ?', true],
    ['(@ia)', true],
    ['@ia, merci', true],
    ['bonjour tout le monde', false],
    ['mon mail test@ia.fr', false],
    ['@iabc', false],
    ['@ia_bot', false],
    ['@iaé', false],
  ])('%j -> %s', (text, expected) => {
    expect(service.shouldReply(text)).toBe(expected);
  });

  it('mode all : repond a tout', () => {
    const { service: all } = setup({ 'assistant.trigger': 'all' });
    expect(all.shouldReply('bonjour')).toBe(true);
  });
});

describe('AssistantService.reply', () => {
  it("envoie l'historique au LLM (prefixe par le nom) et sauvegarde la reponse", async () => {
    const history = [
      msg(1, 'On fait du JWT ?'),
      msg(2, 'Oui', 'assistant', ASSISTANT_USER_ID),
      msg(3, '@ia resume'),
    ];
    const { service, llm, saved } = setup({}, history);
    const reply = await service.reply(project, uuid(2));

    const turns = (llm.complete as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(turns[0].role).toBe('system');
    expect(turns[0].content).toContain('Projet Test');
    expect(turns.slice(1)).toEqual([
      { role: 'user', content: 'Alice : On fait du JWT ?' },
      { role: 'assistant', content: 'Oui' },
      { role: 'user', content: 'Alice : @ia resume' },
    ]);
    expect(reply).toMatchObject({ text: 'reponse', failed: false });
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      id: reply.id,
      role: 'assistant',
      authorId: ASSISTANT_USER_ID,
      body: 'reponse',
      projectId: project.id,
    });
  });

  it('respecte le budget de tokens : les anciens messages sont ecartes', async () => {
    const history = Array.from({ length: 30 }, (_, i) =>
      msg(i + 1, `message numero ${i + 1} ${'x'.repeat(200)}`),
    );
    const { service, llm } = setup(
      { 'assistant.contextTokenBudget': 500 },
      history,
    );
    await service.reply(project, uuid(2));
    const turns = (llm.complete as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(turns.length).toBeLessThan(10);
    expect(turns.at(-1).content).toContain('message numero 30');
  });

  it("transmet le plafond de messages a l'historique lu", async () => {
    const { service, chat } = setup({ 'assistant.contextMaxMessages': 7 }, [
      msg(1, 'a'),
    ]);
    await service.reply(project, uuid(2));
    expect(chat.recent).toHaveBeenCalledWith(project.id, 7);
  });

  it("erreur du LLM : message d'erreur francais sauvegarde, sans lever", async () => {
    const { service, saved } = setup({}, [msg(1, '@ia')], () =>
      Promise.reject(new LlmUnavailableError('LLM indisponible')),
    );
    const reply = await service.reply(project, uuid(2));
    expect(reply).toMatchObject({ failed: true, text: 'LLM indisponible' });
    expect(saved[0].body).toBe('LLM indisponible');
  });

  it('erreur inattendue : texte de repli generique', async () => {
    const { service } = setup({}, [msg(1, '@ia')], () =>
      Promise.reject(new Error('kaboom')),
    );
    const reply = await service.reply(project, uuid(2));
    expect(reply.failed).toBe(true);
    expect(reply.text).toContain('Desole');
    expect(reply.text).not.toContain('kaboom');
  });

  it('tronque une reponse de plus de 4000 caracteres', async () => {
    const { service, saved } = setup({}, [msg(1, '@ia')], () =>
      Promise.resolve('y'.repeat(5000)),
    );
    const reply = await service.reply(project, uuid(2));
    expect(reply.text).toHaveLength(4000);
    expect(saved[0].body).toHaveLength(4000);
  });

  it('une panne de base remonte (le job pourra etre rejoue)', async () => {
    const { service, chat } = setup({}, [msg(1, '@ia')]);
    (chat.saveIfAbsent as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('db down'),
    );
    await expect(service.reply(project, uuid(2))).rejects.toThrow('db down');
  });
});
