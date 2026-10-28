import { Logger, ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const create = vi.fn();
vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create } };
  },
}));

import { AiTasksService } from './ai-tasks.service.js';
import type { CanvasExport } from './canvas.types.js';

const config = (token?: string) =>
  ({
    get: (key: string) => (key === 'openai.token' ? token : 'gpt-test'),
  }) as unknown as ConfigService;

const project = { title: 'Fete', description: null };
const canvas: CanvasExport = {
  canvasId: 'c',
  elements: [
    { id: '1', kind: 'note', text: 'Reserver la salle' },
    { id: '2', kind: 'text', text: 'Budget' },
    { id: '3', kind: 'shape', text: '', geo: 'ellipse' },
    { id: '4', kind: 'arrow', text: 'avant', from: 'A', to: 'B' },
  ],
  chat: [
    {
      id: 'm',
      authorId: 'u',
      body: 'Penser au son',
      sentAt: '2026-01-01T00:00:00.000Z',
      deleted: false,
    },
  ],
  drawingCount: 2,
};

const answer = (content: string | null) =>
  create.mockResolvedValue({ choices: [{ message: { content } }] });

describe('AiTasksService (SDK mocke, aucun reseau)', () => {
  beforeEach(() => create.mockReset());

  it('hasEnoughMaterial : du texte ou une discussion suffisent, des traces seules non', () => {
    const service = new AiTasksService(config('k'));
    expect(service.hasEnoughMaterial(canvas)).toBe(true);
    expect(
      service.hasEnoughMaterial({ ...canvas, elements: [], chat: [] }),
    ).toBe(false);
    expect(
      service.hasEnoughMaterial({
        ...canvas,
        elements: [{ id: '1', kind: 'note', text: '   ' }],
        chat: [],
      }),
    ).toBe(false);
  });

  it('sans cle OpenAI : 503 explicite, aucun appel', async () => {
    await expect(
      new AiTasksService(config(undefined)).proposeTasks(project, canvas),
    ).rejects.toThrow("La generation de taches n'est pas configuree");
    expect(create).not.toHaveBeenCalled();
  });

  it('construit le prompt depuis le Mur et filtre les propositions invalides', async () => {
    answer(
      JSON.stringify({
        tasks: [
          {
            title: '  Reserver la salle  ',
            description: ' d ',
            sourceHints: ['1', 3],
          },
          { title: '' },
          { title: 'x'.repeat(200) },
        ],
      }),
    );
    const tasks = await new AiTasksService(config('k')).proposeTasks(
      project,
      canvas,
    );

    expect(tasks).toHaveLength(2);
    expect(tasks[0]).toEqual({
      title: 'Reserver la salle',
      description: 'd',
      sourceHints: ['1'],
    });
    expect(tasks[1].title).toHaveLength(120);

    const request = create.mock.calls[0][0] as {
      messages: { content: string }[];
    };
    const prompt = request.messages[1].content;
    expect(prompt).toContain('Titre : Fete');
    expect(prompt).toContain('(non renseignee)');
    expect(prompt).toContain('- Reserver la salle');
    expect(prompt).toContain('A -> B (avant)');
    expect(prompt).toContain('2 trace(s) au stylo');
    expect(prompt).toContain('- Penser au son');
  });

  it.each([
    ['reponse vide', null],
    ['JSON invalide', 'pas du json'],
    ['sans tableau tasks', '{"tasks":"non"}'],
  ])('%s : 503 en francais', async (_, content) => {
    answer(content);
    await expect(
      new AiTasksService(config('k')).proposeTasks(project, canvas),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it("transforme un echec de l'API en 503", async () => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    // Pas de vraie promesse rejetee : vitest la signalerait comme non geree.
    create.mockImplementation(() => ({
      catch: (handler: (error: unknown) => unknown) =>
        Promise.resolve().then(() => handler(new Error('boom'))),
    }));
    const error: unknown = await new AiTasksService(config('k'))
      .proposeTasks(project, canvas)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect((error as Error).message).toBe('La generation de taches a echoue.');
  });
});
