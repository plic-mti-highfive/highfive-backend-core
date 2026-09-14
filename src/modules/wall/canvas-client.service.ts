import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CanvasExport } from './canvas.types.js';

/**
 * Client HTTP vers le service canvas.
 *
 * Le contenu du Mur est un document CRDT dont le service canvas est la seule
 * source de verite : on le lui demande plutot que de faire confiance a un
 * instantane envoye par le navigateur, qui pourrait etre perime ou falsifie.
 *
 * L'appel est authentifie par un secret partage : le canvas ignore les droits
 * projet, c'est au core de les avoir verifies avant d'appeler.
 */
@Injectable()
export class CanvasClientService {
  private readonly logger = new Logger(CanvasClientService.name);

  constructor(private readonly config: ConfigService) {}

  /**
   * Renvoie `null` plutot que de lever si le canvas est injoignable : les
   * routes appelantes savent se degrader (un titre generique vaut mieux
   * qu'une conversion impossible).
   */
  async fetchExport(canvasId: string): Promise<CanvasExport | null> {
    const baseUrl = this.config.get<string>('canvas.url')!.replace(/\/$/, '');
    const secret = this.config.get<string>('canvas.internalSecret')!;
    const url = `${baseUrl}/canvas/${encodeURIComponent(canvasId)}/export`;

    try {
      const response = await fetch(url, {
        headers: { 'X-Internal-Secret': secret },
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        this.logger.warn(
          `Export du Mur ${canvasId} refuse : HTTP ${response.status}`,
        );
        return null;
      }

      return (await response.json()) as CanvasExport;
    } catch (error) {
      this.logger.warn(`Service canvas injoignable (${url}): ${String(error)}`);
      return null;
    }
  }
}
