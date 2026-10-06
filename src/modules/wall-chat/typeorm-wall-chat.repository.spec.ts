import { describe, expect, it, vi } from 'vitest';
import type { Repository } from 'typeorm';
import type {
  ConversationEntity,
  MessageEntity,
} from '../../entities/index.js';
import type { ChannelsService } from '../conversations/channels.service.js';
import { TypeormWallChatRepository } from './typeorm-wall-chat.repository.js';
import { ASSISTANT_USER_ID } from './wall-chat.constants.js';
import type { WallChatMessage } from './wall-chat.repository.js';

const message: WallChatMessage = {
  id: 'id',
  projectId: 'p',
  authorId: 'a',
  role: 'user',
  body: 'b',
  sentAt: new Date(1),
};

const make = (
  opts: {
    messages?: Record<string, unknown>;
    conversations?: Record<string, unknown>;
    conversationId?: string | undefined;
  } = {},
) => {
  const wallConversationId = vi
    .fn()
    .mockResolvedValue('conversationId' in opts ? opts.conversationId : 'c1');
  const repo = new TypeormWallChatRepository(
    (opts.messages ?? {}) as unknown as Repository<MessageEntity>,
    (opts.conversations ?? {}) as unknown as Repository<ConversationEntity>,
    { wallConversationId } as unknown as ChannelsService,
  );
  return { repo, wallConversationId };
};

/** Faux query builder d'insertion : enregistre `values`, renvoie `raw`. */
const insertBuilder = (raw: unknown[]) => {
  const values = vi.fn();
  const builder = {
    insert: () => builder,
    values: (v: unknown) => {
      values(v);
      return builder;
    },
    orIgnore: () => builder,
    returning: () => builder,
    execute: () => Promise.resolve({ raw }),
  };
  return { messages: { createQueryBuilder: () => builder }, values };
};

describe('TypeormWallChatRepository', () => {
  it("insere un nouveau message dans la conversation wall, sous l'id du canvas", async () => {
    const { messages, values } = insertBuilder([{ id: 'id' }]);
    const { repo, wallConversationId } = make({ messages });
    expect(await repo.saveIfAbsent(message)).toBe(true);
    expect(wallConversationId).toHaveBeenCalledWith('p');
    expect(values).toHaveBeenCalledWith({
      id: 'id',
      conversationId: 'c1',
      authorId: 'a',
      body: 'b',
      sentAt: message.sentAt,
    });
  });

  it('id deja present (ON CONFLICT DO NOTHING) -> false', async () => {
    const { messages } = insertBuilder([]);
    expect(await make({ messages }).repo.saveIfAbsent(message)).toBe(false);
  });

  it('projet sans conversation (supprime) -> false, rien ecrit', async () => {
    const { messages, values } = insertBuilder([{ id: 'id' }]);
    const { repo } = make({ messages, conversationId: undefined });
    expect(await repo.saveIfAbsent(message)).toBe(false);
    expect(values).not.toHaveBeenCalled();
  });

  it('erreur SQL -> remonte', async () => {
    const messages = {
      createQueryBuilder: () => {
        throw new Error('db down');
      },
    };
    await expect(make({ messages }).repo.saveIfAbsent(message)).rejects.toThrow(
      'db down',
    );
  });

  it('recent() renvoie les derniers messages en ordre chronologique, role derive', async () => {
    const find = vi.fn().mockResolvedValue([
      { id: '3', authorId: ASSISTANT_USER_ID, body: 'r', sentAt: new Date(3) },
      { id: '2', authorId: 'a', body: 'q', sentAt: new Date(2) },
      { id: '1', authorId: 'a', body: 'p', sentAt: new Date(1) },
    ]);
    const conversations = {
      findOne: vi.fn().mockResolvedValue({ id: 'c1' }),
    };
    const out = await make({ messages: { find }, conversations }).repo.recent(
      'p',
      3,
    );
    expect(out.map((m) => m.id)).toEqual(['1', '2', '3']);
    expect(out.map((m) => m.role)).toEqual(['user', 'user', 'assistant']);
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { conversationId: 'c1', deleted: false },
        take: 3,
      }),
    );
  });

  it('recent() sans conversation -> liste vide', async () => {
    const conversations = { findOne: vi.fn().mockResolvedValue(null) };
    expect(await make({ conversations }).repo.recent('p', 3)).toEqual([]);
  });

  it('findById() ne renvoie que les messages d une conversation wall', async () => {
    const messages = {
      findOneBy: vi.fn().mockResolvedValue({
        id: 'id',
        conversationId: 'c1',
        authorId: 'a',
        body: 'b',
        sentAt: new Date(1),
      }),
    };
    const findOneBy = vi.fn().mockResolvedValue(null);
    const { repo } = make({ messages, conversations: { findOneBy } });
    expect(await repo.findById('id')).toBeUndefined();
    expect(findOneBy).toHaveBeenCalledWith({ id: 'c1', kind: 'wall' });

    findOneBy.mockResolvedValue({ id: 'c1', projectId: 'p' });
    expect(await repo.findById('id')).toMatchObject({
      id: 'id',
      projectId: 'p',
    });
  });
});
