import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import type {
  CanvasExport,
  ProposedTask,
} from '@plic-mti-highfive/shared-types';

interface ProjectContext {
  name: string;
  description: string | null;
}

/**
 * Transforme le contenu d'un canvas de brainstorming en taches actionnables.
 *
 * Rien n'est persiste ici : le service ne fait que proposer. C'est l'utilisateur
 * qui tranche ensuite, pour qu'une generation ratee ne pollue jamais le projet.
 */
@Injectable()
export class AiTasksService {
  private readonly logger = new Logger(AiTasksService.name);
  private client?: OpenAI;

  constructor(private readonly config: ConfigService) {}

  /**
   * Le client est cree a la demande : le backend doit pouvoir demarrer sans
   * token OpenAI (tout le reste de l'application n'en depend pas).
   */
  private getClient(): OpenAI {
    if (this.client) return this.client;

    const apiKey = this.config.get<string>('openai.token');
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'OPENAI_TOKEN is not configured on the server',
      );
    }

    this.client = new OpenAI({ apiKey });
    return this.client;
  }

  /** Un canvas sans un mot de texte ne peut rien produire d'utile. */
  hasEnoughMaterial(canvas: CanvasExport): boolean {
    const hasText = canvas.elements.some((e) => e.text.trim().length > 0);
    return hasText || canvas.chat.length > 0;
  }

  async proposeTasks(
    project: ProjectContext,
    canvas: CanvasExport,
  ): Promise<ProposedTask[]> {
    const client = this.getClient();
    const model = this.config.get<string>('openai.model')!;

    const response = await client.chat.completions
      .create({
        model,
        // Peu de creativite : on veut des taches fideles au canvas, pas inventees.
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserPrompt(project, canvas) },
        ],
      })
      .catch((error: unknown) => {
        this.logger.error('OpenAI call failed', error);
        throw new ServiceUnavailableException('Task generation failed');
      });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new ServiceUnavailableException('Task generation returned nothing');
    }

    return parseTasks(content, this.logger);
  }
}

const SYSTEM_PROMPT = `Tu es un chef de projet qui depouille un canvas de brainstorming pour en tirer un plan d'action.

On te donne le nom et la description d'un projet, puis le contenu d'un canvas collaboratif : post-its, zones de texte, formes annotees, fleches reliant des elements (elles expriment une dependance ou un enchainement), et les messages echanges dans le chat du canvas.

Deduis-en des taches concretes et actionnables.

Regles :
- Ne t'appuie que sur le canvas, le nom et la description du projet. N'invente aucune fonctionnalite qui n'y est pas evoquee.
- Une tache = une action realisable, formulee a l'infinitif (ex: "Mettre en place l'authentification OAuth").
- Les fleches indiquent des dependances : refletes-les dans l'ordre des taches.
- Entre 3 et 10 taches. S'il y a peu de matiere, propose-en moins plutot que de remplir.
- Reponds en francais.

Reponds STRICTEMENT en JSON, sans texte autour :
{"tasks":[{"title":"...","description":"...","sourceHints":["element du canvas ayant motive la tache"]}]}`;

const buildUserPrompt = (
  project: ProjectContext,
  canvas: CanvasExport,
): string => {
  const lines: string[] = [
    `# Projet`,
    `Nom : ${project.name}`,
    `Description : ${project.description?.trim() || '(non renseignee)'}`,
    ``,
    `# Canvas`,
  ];

  const notes = canvas.elements.filter((e) => e.kind === 'note');
  const texts = canvas.elements.filter((e) => e.kind === 'text');
  const shapes = canvas.elements.filter((e) => e.kind === 'shape');
  const arrows = canvas.elements.filter((e) => e.kind === 'arrow');

  if (notes.length) {
    lines.push('', 'Post-its :', ...notes.map((n) => `- ${n.text}`));
  }
  if (texts.length) {
    lines.push('', 'Textes :', ...texts.map((t) => `- ${t.text}`));
  }
  if (shapes.length) {
    lines.push(
      '',
      'Formes annotees :',
      ...shapes.map((s) => `- [${s.geo}] ${s.text || '(sans texte)'}`),
    );
  }
  if (arrows.length) {
    lines.push(
      '',
      'Liens (fleches) :',
      ...arrows.map((a) => {
        const label = a.text ? ` (${a.text})` : '';
        return `- ${a.from ?? '?'} -> ${a.to ?? '?'}${label}`;
      }),
    );
  }
  if (canvas.drawingCount > 0) {
    lines.push(
      '',
      `${canvas.drawingCount} trace(s) au stylo, sans texte exploitable.`,
    );
  }
  if (canvas.chat.length) {
    lines.push('', 'Discussion :', ...canvas.chat.map((m) => `- ${m.text}`));
  }

  return lines.join('\n');
};

/**
 * Le modele est contraint en JSON, mais on ne lui fait pas confiance pour autant :
 * une reponse malformee ne doit pas remonter en 500 ni produire des taches vides.
 */
const parseTasks = (content: string, logger: Logger): ProposedTask[] => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    logger.error(`OpenAI returned invalid JSON: ${content.slice(0, 200)}`);
    throw new ServiceUnavailableException(
      'Task generation returned invalid JSON',
    );
  }

  const raw = (parsed as { tasks?: unknown }).tasks;
  if (!Array.isArray(raw)) {
    logger.error('OpenAI response has no "tasks" array');
    throw new ServiceUnavailableException(
      'Task generation returned invalid JSON',
    );
  }

  return raw
    .map((item): ProposedTask | null => {
      const t = item as Record<string, unknown>;
      const title = typeof t.title === 'string' ? t.title.trim() : '';
      if (!title) return null;

      return {
        title,
        description:
          typeof t.description === 'string' ? t.description.trim() : '',
        sourceHints: Array.isArray(t.sourceHints)
          ? t.sourceHints.filter((h): h is string => typeof h === 'string')
          : [],
      };
    })
    .filter((task): task is ProposedTask => task !== null);
};
