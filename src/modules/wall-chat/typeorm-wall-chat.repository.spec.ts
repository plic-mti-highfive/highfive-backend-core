import { describe, expect, it, vi } from 'vitest';
import type { Repository } from 'typeorm';
import type { WallChatMessageEntity } from '../../entities/index.js';
import { TypeormWallChatRepository } from './typeorm-wall-chat.repository.js';
import type { WallChatMessage } from './wall-chat.repository.js';

const message = {
  id: 'id',
  projectId: 'p',
  canvasId: 'c',
  authorId: 'a',
  role: 'user',
  body: 'b',
  sentAt: new Date(1),
} as WallChatMessage;

const make = (
  rows: Partial<Record<keyof Repository<WallChatMessageEntity>, unknown>>,
) =>
  new TypeormWallChatRepository(
    rows as unknown as Repository<WallChatMessageEntity>,
  );

describe('TypeormWallChatRepository', () => {
  it('insere un nouveau message', async () => {
    const insert = vi.fn().mockResolvedValue(undefined);
    const repo = make({ existsBy: vi.fn().mockResolvedValue(false), insert });
    expect(await repo.saveIfAbsent(message)).toBe(true);
    expect(insert).toHaveBeenCalledWith(message);
  });

  it("n'insere pas un id deja present", async () => {
    const insert = vi.fn();
    const repo = make({ existsBy: vi.fn().mockResolvedValue(true), insert });
    expect(await repo.saveIfAbsent(message)).toBe(false);
    expect(insert).not.toHaveBeenCalled();
  });

  it('course entre deux jobs (violation 23505) -> false, sans lever', async () => {
    const repo = make({
      existsBy: vi.fn().mockResolvedValue(false),
      insert: vi.fn().mockRejectedValue({ code: '23505' }),
    });
    expect(await repo.saveIfAbsent(message)).toBe(false);
  });

  it('autre erreur SQL -> remonte', async () => {
    const repo = make({
      existsBy: vi.fn().mockResolvedValue(false),
      insert: vi.fn().mockRejectedValue(new Error('db down')),
    });
    await expect(repo.saveIfAbsent(message)).rejects.toThrow('db down');
  });

  it('recent() renvoie les derniers messages en ordre chronologique', async () => {
    const find = vi
      .fn()
      .mockResolvedValue([{ id: '3' }, { id: '2' }, { id: '1' }]);
    const out = await make({ find }).recent('p', 3);
    expect(out.map((m) => m.id)).toEqual(['1', '2', '3']);
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { projectId: 'p' }, take: 3 }),
    );
  });
});
