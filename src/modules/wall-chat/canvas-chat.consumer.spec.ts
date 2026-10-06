import { describe, expect, it, vi } from 'vitest';
import type { Job } from 'bullmq';
import type { Repository } from 'typeorm';
import type { ProjectEntity, WallEntity } from '../../entities/index.js';
import type { CanvasChatJobData } from '../wall/canvas.types.js';
import type { CanvasClientService } from '../wall/canvas-client.service.js';
import type { AssistantService } from './assistant/assistant.service.js';
import { CanvasChatConsumer } from './canvas-chat.consumer.js';
import { ASSISTANT_USER_ID } from './wall-chat.constants.js';
import type { WallChatRepository } from './wall-chat.repository.js';

const uuid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const project = { id: uuid(1), title: 'P' } as ProjectEntity;

const setup = (
  opts: {
    created?: boolean;
    reply?: boolean;
    wall?: boolean;
    existingReply?: boolean;
  } = {},
) => {
  const save = vi.fn().mockResolvedValue(opts.created ?? true);
  const reply = vi.fn().mockResolvedValue({
    id: uuid(9),
    text: 'ok',
    sentAt: new Date(5),
    failed: false,
  });
  const post = vi.fn().mockResolvedValue(true);
  const chat = {
    saveIfAbsent: save,
    recent: vi.fn(),
    conversationIdOf: vi.fn().mockResolvedValue(uuid(7)),
    findById: vi
      .fn()
      .mockResolvedValue(
        opts.existingReply
          ? { id: uuid(9), body: 'deja repondu', sentAt: new Date(5) }
          : undefined,
      ),
  } as unknown as WallChatRepository;
  const walls = {
    findOne: vi
      .fn()
      .mockResolvedValue(
        opts.wall === false
          ? null
          : { projectId: project.id, canvasId: uuid(2) },
      ),
  } as unknown as Repository<WallEntity>;
  const projects = {
    findOne: vi.fn().mockResolvedValue(project),
  } as unknown as Repository<ProjectEntity>;
  const assistant = {
    shouldReply: vi.fn().mockReturnValue(opts.reply ?? true),
    reply,
  } as unknown as AssistantService;
  const canvas = {
    postChatMessage: post,
  } as unknown as CanvasClientService;
  const consumer = new CanvasChatConsumer(
    walls,
    projects,
    chat,
    assistant,
    canvas,
  );
  return { consumer, save, reply, post };
};

const job = (
  data: Partial<CanvasChatJobData> = {},
  name = 'canvas_chat_message',
) =>
  ({
    id: 'j1',
    name,
    data: {
      id: uuid(3),
      authorId: uuid(4),
      body: '@ia salut',
      sentAt: new Date(1).toISOString(),
      deleted: false,
      canvasId: uuid(2),
      ...data,
    },
  }) as unknown as Job<CanvasChatJobData>;

describe('CanvasChatConsumer', () => {
  it('sauvegarde le message puis renvoie la reponse au canvas', async () => {
    const { consumer, save, reply, post } = setup();
    await consumer.process(job());
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: uuid(3),
        role: 'user',
        projectId: project.id,
      }),
    );
    expect(reply).toHaveBeenCalledOnce();
    expect(post).toHaveBeenCalledWith(
      uuid(2),
      expect.objectContaining({
        id: uuid(9),
        authorId: ASSISTANT_USER_ID,
        isAssistant: true,
      }),
    );
  });

  it('idempotent : un message deja vu et deja repondu ne relance pas le LLM, il re-diffuse', async () => {
    const { consumer, reply, post } = setup({
      created: false,
      existingReply: true,
    });
    await consumer.process(job());
    expect(reply).not.toHaveBeenCalled();
    expect(post).toHaveBeenCalledWith(
      uuid(2),
      expect.objectContaining({
        id: uuid(9),
        body: 'deja repondu',
        conversationId: uuid(7),
        deleted: false,
      }),
    );
  });

  it('message deja vu mais jamais repondu (job precedent tombe) : la reponse est generee', async () => {
    const { consumer, reply } = setup({ created: false });
    await consumer.process(job());
    expect(reply).toHaveBeenCalledOnce();
  });

  it("sauvegarde sans repondre quand l'assistant n'est pas sollicite", async () => {
    const { consumer, save, reply } = setup({ reply: false });
    await consumer.process(job({ body: 'bonjour' }));
    expect(save).toHaveBeenCalled();
    expect(reply).not.toHaveBeenCalled();
  });

  it('ignore un Mur inconnu, un autre type de job ou des ids invalides', async () => {
    const a = setup({ wall: false });
    await a.consumer.process(job());
    const b = setup();
    await b.consumer.process(job({}, 'autre'));
    await b.consumer.process(job({ id: 'pas-un-uuid' }));
    expect(a.save).not.toHaveBeenCalled();
    expect(b.save).not.toHaveBeenCalled();
  });

  it("n'echoue pas si le canvas est injoignable", async () => {
    const { consumer, post } = setup();
    post.mockResolvedValue(false);
    await expect(consumer.process(job())).resolves.toBeUndefined();
  });
});
