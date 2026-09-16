import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import type { CanvasExport, ProposedTask } from './canvas.types.js';

interface ProjectContext {
  title: string;
  description: string | null;
}

/**
 * Transforme le contenu du Mur en taches actionnables.
 *
 * Rien n'est persiste ici : le service ne fait que proposer. C'est la personne
 * qui tranche ensuite, pour qu'une generation ratee ne pollue jamais Les
 * Taches (R-IA-1 : aucune ecriture avant acceptation explicite).
 *
 * Cette capacite n'est pas encore appelee par le front — voir
 * `docs/REFACTO-V2.md`, inventaire des fonctions du canvas.
 */
@Injectable()
export class AiTasksService {
  private readonly logger = new Logger(AiTasksService.name);
  private client?: OpenAI;

  constructor(private readonly config: ConfigService) {}

  /**
   * Le client est cree a la demande : le backend doit pouvoir demarrer sans
   * cle OpenAI, dont rien d'autre ne depend.
   */
  private getClient(): OpenAI {
    if (this.client) return this.client;

    const apiKey = this.config.get<string>('openai.token');
    if (!apiKey) {
      throw new ServiceUnavailableException(
        "La generation de taches n'est pas configuree sur ce serveur.",
      );
    }

    this.client = new OpenAI({ apiKey });
    return this.client;
  }

  /** Un Mur sans un mot de texte ne peut rien produire d'utile. */
  hasEnoughMaterial(canvas: CanvasExport): boolean {
    return (
      canvas.elements.some((element) => element.text.trim().length > 0) ||
      canvas.chat.length > 0
    );
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
        // Peu de creativite : on veut des taches fideles au Mur, pas inventees.
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserPrompt(project, canvas) },
        ],
      })
      .catch((error: unknown) => {
        this.logger.error('Appel OpenAI en echec', error);
        throw new ServiceUnavailableException(
          'La generation de taches a echoue.',
        );
      });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new ServiceUnavailableException(
        "La generation de taches n'a rien renvoye.",
      );
    }

    return parseTasks(content, this.logger);
  }
}

const SYSTEM_PROMPT = `Tu es un chef de projet qui depouille un mur de brainstorming pour en tirer un plan d'action.

On te donne le titre et la description d'un projet, puis le contenu d'un mur collaboratif : post-its, zones de texte, formes annotees, fleches reliant des elements (elles expriment une dependance ou un enchainement), et les messages echanges dans la discussion du mur.

Deduis-en des taches concretes et actionnables.

Regles :
- Appuie toi sur le mur, le titre et la description du projet. N'invente aucune fonctionnalite qui n'y est pas evoquee.
- Une tache = une action realisable, formulee a l'infinitif (ex: "Reserver la salle des fetes").
- Les fleches indiquent des dependances : refletes-les dans l'ordre des taches.
- Entre 3 et 10 taches. S'il y a peu de matiere, propose-en moins plutot que de remplir.
- Reponds en francais, en tutoyant, sans emoji.

Reponds STRICTEMENT en JSON, sans texte autour :
{"tasks":[{"title":"...","description":"...","sourceHints":["element du mur ayant motive la tache"]}]}`;

const buildUserPrompt = (
  project: ProjectContext,
  canvas: CanvasExport,
): string => {
  const lines: string[] = [
    '# Projet',
    `Titre : ${project.title}`,
    `Description : ${project.description?.trim() || '(non renseignee)'}`,
    '',
    '# Le Mur',
  ];

  const byKind = (kind: string) =>
    canvas.elements.filter((element) => element.kind === kind);

  const notes = byKind('note');
  const texts = byKind('text');
  const shapes = byKind('shape');
  const arrows = byKind('arrow');

  if (notes.length) {
    lines.push('', 'Post-its :', ...notes.map((note) => `- ${note.text}`));
  }
  if (texts.length) {
    lines.push('', 'Textes :', ...texts.map((text) => `- ${text.text}`));
  }
  if (shapes.length) {
    lines.push(
      '',
      'Formes annotees :',
      ...shapes.map(
        (shape) => `- [${shape.geo}] ${shape.text || '(sans texte)'}`,
      ),
    );
  }
  if (arrows.length) {
    lines.push(
      '',
      'Liens (fleches) :',
      ...arrows.map((arrow) => {
        const label = arrow.text ? ` (${arrow.text})` : '';
        return `- ${arrow.from ?? '?'} -> ${arrow.to ?? '?'}${label}`;
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
    lines.push(
      '',
      'Discussion :',
      ...canvas.chat.map((message) => `- ${message.text}`),
    );
  }

  return lines.join('\n');
};

/**
 * Le modele est contraint en JSON, mais on ne lui fait pas confiance pour
 * autant : une reponse malformee ne doit produire ni erreur 500 ni taches
 * vides.
 */
const parseTasks = (content: string, logger: Logger): ProposedTask[] => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    logger.error(`Reponse OpenAI non JSON : ${content.slice(0, 200)}`);
    throw new ServiceUnavailableException(
      'La generation de taches a renvoye une reponse illisible.',
    );
  }

  const raw = (parsed as { tasks?: unknown }).tasks;
  if (!Array.isArray(raw)) {
    logger.error('Reponse OpenAI sans tableau "tasks"');
    throw new ServiceUnavailableException(
      'La generation de taches a renvoye une reponse illisible.',
    );
  }

  return raw
    .map((item): ProposedTask | null => {
      const task = item as Record<string, unknown>;
      const title = typeof task.title === 'string' ? task.title.trim() : '';
      if (!title) return null;

      return {
        title: title.slice(0, 120),
        description:
          typeof task.description === 'string' ? task.description.trim() : '',
        sourceHints: Array.isArray(task.sourceHints)
          ? task.sourceHints.filter(
              (hint): hint is string => typeof hint === 'string',
            )
          : [],
      };
    })
    .filter((task): task is ProposedTask => task !== null);
};
