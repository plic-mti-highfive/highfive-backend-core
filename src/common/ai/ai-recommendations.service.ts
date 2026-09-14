import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Lecture des recommandations du service IA.
 *
 * U1 (doc 18) reste **algorithmique et facultatif** : ce service ne renvoie
 * qu'un ordre de preference. Si l'IA est indisponible, lente ou vide, on
 * renvoie une liste vide et l'appelant retombe sur ses regles deterministes
 * (themes partages, activite recente). Un fil qui s'affiche moins bien vaut
 * mieux qu'un fil qui ne s'affiche pas.
 *
 * R-IA-28 : une seule tentative, 12 secondes au maximum, aucune reprise.
 */
@Injectable()
export class AiRecommendationsService {
  private readonly logger = new Logger(AiRecommendationsService.name);
  private readonly baseUrl: string;
  private readonly tenantId: string;
  private readonly timeoutMs: number;

  constructor(config: ConfigService) {
    this.baseUrl = (config.get<string>('ai.url') ?? '').replace(/\/$/, '');
    this.tenantId = config.get<string>('ai.tenantId')!;
    this.timeoutMs = config.get<number>('ai.timeoutMs', 12_000);
  }

  /** Projets recommandes a une personne, du plus pertinent au moins. */
  projectsForUser(userId: string, limit: number): Promise<string[]> {
    return this.ids(`/api/v1/matchmaking/users/${userId}/projects`, limit);
  }

  /** Personnes recommandees pour un projet (colonne « Des gens a rencontrer »). */
  usersForProject(projectId: string, limit: number): Promise<string[]> {
    return this.ids(`/api/v1/matchmaking/projects/${projectId}/users`, limit);
  }

  /** Projets en vogue, ponderes par la fraicheur des interactions. */
  trendingProjects(limit: number): Promise<string[]> {
    return this.ids('/api/v1/matchmaking/trending', limit);
  }

  private async ids(path: string, limit: number): Promise<string[]> {
    if (!this.baseUrl) return [];

    try {
      const response = await fetch(
        `${this.baseUrl}${path}?limit=${limit}&tenant_id=${this.tenantId}`,
        { signal: AbortSignal.timeout(this.timeoutMs) },
      );
      if (!response.ok) return [];

      const items = (await response.json()) as { id?: string }[];
      return Array.isArray(items)
        ? items.map((item) => item.id).filter((id): id is string => !!id)
        : [];
    } catch (error) {
      this.logger.debug(
        `Recommandation IA indisponible (${path}): ${String(error)}`,
      );
      return [];
    }
  }
}
