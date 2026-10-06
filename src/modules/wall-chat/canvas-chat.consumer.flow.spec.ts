/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return -- mocks de test */
import { ConfigService } from '@nestjs/config';
import type { Job } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';
import type { Repository } from 'typeorm';
import type {
  ProjectEntity,
  UserEntity,
  WallEntity,
} from '../../entities/index.js';
import type { CanvasChatJobData } from '../wall/canvas.types.js';
import type { CanvasClientService } from '../wall/canvas-client.service.js';
import { AssistantService } from './assistant/assistant.service.js';
import { LlmService } from './assistant/llm.service.js';
import { CanvasChatConsumer } from './canvas-chat.consumer.js';
import { ASSISTANT_USER_ID } from './wall-chat.constants.js';
import {
  WallChatRepository,
  type WallChatMessage,
} from './wall-chat.repository.js';

const uuid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const project = { id: uuid(1), title: 'P' } as ProjectEntity;

/** Depot en memoire, meme contrat que le depot TypeORM. */
class MemoryRepo extends WallChatRepository {
  rows = new Map<string, WallChatMessage>();
  failNextSave = false;
  saveIfAbsent(m: WallChatMessage): Promise<boolean> {
    if (this.failNextSave) {
      this.failNextSave = false;
      return Promise.reject(new Error('db down'));
    }
    if (this.rows.has(m.id)) return Promise.resolve(false);
    this.rows.set(m.id, m);
    return Promise.resolve(true);
  }
  recent(projectId: string, limit: number): Promise<WallChatMessage[]> {
    return Promise.resolve(
      [...this.rows.values()]
        .filter((m) => m.projectId === projectId)
        .sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime())
        .slice(-limit),
    );
  }
  findById(id: string): Promise<WallChatMessage | undefined> {
    return Promise.resolve(this.rows.get(id));
  }
  conversationIdOf(): Promise<string | undefined> {
    return Promise.resolve(uuid(7));
  }
}

const setup = (config: Record<string, unknown> = {}) => {
  const repo = new MemoryRepo();
  const llm = new LlmService({
    get: (k: string) => ({ 'assistant.provider': 'fake', ...config })[k],
  } as unknown as ConfigService);
  const completeSpy = vi.spyOn(llm, 'complete');
  const assistant = new AssistantService(
    { get: (k: string) => config[k] } as unknown as ConfigService,
    repo,
    llm,
    { find: () => Promise.resolve([]) } as unknown as Repository<UserEntity>,
  );
  const post = vi.fn().mockResolvedValue(true);
  const consumer = new CanvasChatConsumer(
    {
      findOne: () => Promise.resolve({ projectId: project.id }),
    } as unknown as Repository<WallEntity>,
    {
      findOne: () => Promise.resolve(project),
    } as unknown as Repository<ProjectEntity>,
    repo,
    assistant,
    { postChatMessage: post } as unknown as CanvasClientService,
  );
  return { consumer, repo, post, completeSpy };
};

let seq = 10;
const job = (text: string, extra: Partial<CanvasChatJobData> = {}) =>
  ({
    id: 'j',
    name: 'canvas_chat_message',
    data: {
      id: uuid(seq++),
      authorId: uuid(4),
      body: text,
      sentAt: new Date(seq).toISOString(),
      deleted: false,
      canvasId: uuid(2),
      ...extra,
    },
  }) as unknown as Job<CanvasChatJobData>;

describe('chat du Mur : consommateur + assistant + depot (LLM fake)', () => {
  it('message -> sauvegarde -> reponse sauvegardee -> renvoyee au canvas', async () => {
    const { consumer, repo, post } = setup();
    await consumer.process(job('@ia bonjour'));
    const rows = [...repo.rows.values()];
    expect(rows.map((r) => r.role)).toEqual(['user', 'assistant']);
    expect(post).toHaveBeenCalledOnce();
    expect(post.mock.calls[0][1]).toMatchObject({
      id: rows[1].id,
      authorId: ASSISTANT_USER_ID,
      isAssistant: true,
    });
    expect(post.mock.calls[0][1].body).toContain('Contexte : 1 message(s)');
  });

  it("contextualisation : l'historique grandit d'un message a l'autre", async () => {
    const { consumer, post } = setup();
    await consumer.process(job('premier message'));
    await consumer.process(job('deuxieme message'));
    await consumer.process(job('@ia resume'));
    // 2 humains + @ia = 3 ; l'assistant n'a pas encore repondu avant.
    expect(post.mock.calls[0][1].body).toContain('Contexte : 3 message(s)');
    await consumer.process(job('@ia encore'));
    // + sa reponse precedente + le nouveau message = 5
    expect(post.mock.calls[1][1].body).toContain('Contexte : 5 message(s)');
  });

  it('sans @ia : sauvegarde seule, ni LLM ni canvas', async () => {
    const { consumer, repo, post, completeSpy } = setup();
    await consumer.process(job('discussion entre humains'));
    expect(repo.rows.size).toBe(1);
    expect(completeSpy).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });

  it('mode all : tout message declenche une reponse', async () => {
    const { consumer, post } = setup({ 'assistant.trigger': 'all' });
    await consumer.process(job('sans mention'));
    expect(post).toHaveBeenCalledOnce();
  });

  it("un message de l'assistant ne declenche jamais de reponse (pas de boucle)", async () => {
    const { consumer, post } = setup({ 'assistant.trigger': 'all' });
    await consumer.process(job('@ia', { authorId: ASSISTANT_USER_ID }));
    expect(post).not.toHaveBeenCalled();
  });

  it('job rejoue apres succes : aucun doublon, aucun nouvel appel LLM (re-diffusion idempotente)', async () => {
    const { consumer, repo, post, completeSpy } = setup();
    const j = job('@ia salut');
    await consumer.process(j);
    await consumer.process(j);
    expect(repo.rows.size).toBe(2);
    expect(completeSpy).toHaveBeenCalledOnce();
    expect(post.mock.calls[1][1].id).toBe(post.mock.calls[0][1].id);
  });

  it('erreur LLM : un message d erreur francais est sauvegarde et diffuse', async () => {
    const { consumer, repo, post } = setup({
      'assistant.provider': 'inconnu',
    });
    await consumer.process(job('@ia ?'));
    const reply = [...repo.rows.values()].find((r) => r.role === 'assistant');
    expect(reply?.body).toMatch(/pas disponible/);
    expect(post.mock.calls[0][1].body).toBe(reply?.body);
  });

  it('panne de base pendant la reponse puis rejeu : la reponse est quand meme donnee', async () => {
    const { consumer, repo, post } = setup();
    const j = job('@ia salut');
    // 1re ecriture (message utilisateur) ok, 2e (reponse) en panne.
    const original = repo.saveIfAbsent.bind(repo);
    let calls = 0;
    repo.saveIfAbsent = (m) =>
      ++calls === 2 ? Promise.reject(new Error('db down')) : original(m);

    await expect(consumer.process(j)).rejects.toThrow('db down');
    expect(post).not.toHaveBeenCalled();

    await consumer.process(j); // rejeu BullMQ
    expect([...repo.rows.values()].map((r) => r.role)).toEqual([
      'user',
      'assistant',
    ]);
    expect(post).toHaveBeenCalledOnce();
  });

  it('rejeu apres crash entre sauvegarde de la reponse et diffusion : re-diffuse, sans 2e reponse', async () => {
    const { consumer, repo, post, completeSpy } = setup();
    const j = job('@ia salut');
    post.mockRejectedValueOnce(new Error('crash'));
    await expect(consumer.process(j)).rejects.toThrow('crash');
    await consumer.process(j);
    expect(
      [...repo.rows.values()].filter((r) => r.role === 'assistant'),
    ).toHaveLength(1);
    expect(completeSpy).toHaveBeenCalledOnce();
    expect(post).toHaveBeenCalledTimes(2);
    expect(post.mock.calls[1][1].id).toBe(
      [...repo.rows.values()].find((r) => r.role === 'assistant')?.id,
    );
  });

  it('tronque a 4000 caracteres le texte sauvegarde', async () => {
    const { consumer, repo } = setup();
    await consumer.process(job('x'.repeat(5000)));
    expect([...repo.rows.values()][0].body).toHaveLength(4000);
  });
});
