import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException } from '@nestjs/common';
import type { CanvasExport } from '@plic-mti-highfive/shared-types';
import { AiTasksService } from './ai-tasks.service.js';

interface ChatCompletionArgs {
  model: string;
  messages: { role: string; content: string }[];
}

// Mock type : sans quoi create.mock.calls remonterait en `any`, interdit par le lint.
const create = vi.fn<(args: ChatCompletionArgs) => Promise<unknown>>();

vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create } };
  },
}));

const emptyCanvas = (): CanvasExport => ({
  canvasId: 'c1',
  projectId: 'p1',
  tenantId: 't1',
  elements: [],
  chat: [],
  drawingCount: 0,
});

const reply = (content: string) => ({ choices: [{ message: { content } }] });

describe('AiTasksService', () => {
  let service: AiTasksService;

  beforeEach(async () => {
    create.mockReset();

    const config: Partial<ConfigService> = {
      get: vi.fn((key: string) =>
        key === 'openai.token' ? 'sk-test' : 'gpt-4o-mini',
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [AiTasksService, { provide: ConfigService, useValue: config }],
    }).compile();

    service = module.get(AiTasksService);
  });

  describe('hasEnoughMaterial', () => {
    it('refuse un canvas vide', () => {
      expect(service.hasEnoughMaterial(emptyCanvas())).toBe(false);
    });

    it('refuse un canvas qui ne contient que des traces au stylo', () => {
      const canvas = { ...emptyCanvas(), drawingCount: 12 };
      expect(service.hasEnoughMaterial(canvas)).toBe(false);
    });

    it('accepte un canvas des lors qu un element porte du texte', () => {
      const canvas: CanvasExport = {
        ...emptyCanvas(),
        elements: [{ id: 's1', kind: 'note', text: 'Auth' }],
      };
      expect(service.hasEnoughMaterial(canvas)).toBe(true);
    });

    it('accepte un canvas sans shape mais avec du chat', () => {
      const canvas: CanvasExport = {
        ...emptyCanvas(),
        chat: [
          {
            id: 'm1',
            text: 'On part sur du JWT',
            authorId: 'u1',
            timestamp: 1,
          },
        ],
      };
      expect(service.hasEnoughMaterial(canvas)).toBe(true);
    });
  });

  describe('proposeTasks', () => {
    const project = { name: 'HighFive', description: 'Plateforme projets' };

    it('remonte les taches renvoyees par le modele', async () => {
      create.mockResolvedValue(
        reply(
          JSON.stringify({
            tasks: [
              {
                title: 'Mettre en place OAuth',
                description: 'via Google',
                sourceHints: ['Auth'],
              },
            ],
          }),
        ),
      );

      const tasks = await service.proposeTasks(project, emptyCanvas());
      expect(tasks).toEqual([
        {
          title: 'Mettre en place OAuth',
          description: 'via Google',
          sourceHints: ['Auth'],
        },
      ]);
    });

    it('ecarte les taches sans titre plutot que de creer des tickets vides', async () => {
      create.mockResolvedValue(
        reply(
          JSON.stringify({
            tasks: [
              { title: '   ', description: 'sans titre' },
              { title: 'Valide', description: 'ok' },
            ],
          }),
        ),
      );

      const tasks = await service.proposeTasks(project, emptyCanvas());
      expect(tasks).toHaveLength(1);
      expect(tasks[0].title).toBe('Valide');
    });

    it('tolere une tache sans description ni sourceHints', async () => {
      create.mockResolvedValue(
        reply(JSON.stringify({ tasks: [{ title: 'Seule' }] })),
      );

      const tasks = await service.proposeTasks(project, emptyCanvas());
      expect(tasks[0]).toEqual({
        title: 'Seule',
        description: '',
        sourceHints: [],
      });
    });

    it('echoue proprement quand le modele ne renvoie pas du JSON', async () => {
      create.mockResolvedValue(reply('Voici vos taches : ...'));

      await expect(
        service.proposeTasks(project, emptyCanvas()),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it('echoue proprement quand le JSON n a pas de tableau "tasks"', async () => {
      create.mockResolvedValue(reply(JSON.stringify({ resultat: [] })));

      await expect(
        service.proposeTasks(project, emptyCanvas()),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it('echoue proprement quand l appel OpenAI tombe', async () => {
      create.mockRejectedValue(new Error('network down'));

      await expect(
        service.proposeTasks(project, emptyCanvas()),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it('inclut post-its, fleches et chat dans le prompt envoye au modele', async () => {
      create.mockResolvedValue(reply(JSON.stringify({ tasks: [] })));

      const canvas: CanvasExport = {
        ...emptyCanvas(),
        elements: [
          { id: 's1', kind: 'note', text: 'Authentification' },
          { id: 's2', kind: 'arrow', text: '', from: 'Frontend', to: 'API' },
        ],
        chat: [
          {
            id: 'm1',
            text: 'Prevoir le refresh token',
            authorId: 'u1',
            timestamp: 1,
          },
        ],
      };

      await service.proposeTasks(project, canvas);

      const prompt = create.mock.calls[0][0].messages[1].content;
      expect(prompt).toContain('HighFive');
      expect(prompt).toContain('Authentification');
      expect(prompt).toContain('Frontend -> API');
      expect(prompt).toContain('Prevoir le refresh token');
    });
  });

  describe('sans OPENAI_TOKEN', () => {
    it('echoue explicitement au lieu d appeler l API avec une cle vide', async () => {
      const config: Partial<ConfigService> = {
        get: vi.fn(() => undefined),
      };
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AiTasksService,
          { provide: ConfigService, useValue: config },
        ],
      }).compile();

      const bare = module.get(AiTasksService);
      await expect(
        bare.proposeTasks({ name: 'x', description: null }, emptyCanvas()),
      ).rejects.toThrow(/OPENAI_TOKEN/);
    });
  });
});
