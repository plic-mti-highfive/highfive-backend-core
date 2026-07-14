import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CanvasExport } from '@plic-mti-highfive/shared-types';

/**
 * Client HTTP vers le service canvas.
 *
 * Le contenu du canvas est un document CRDT dont le serveur canvas est la seule
 * source de verite : on va le lui demander plutot que de faire confiance a un
 * snapshot envoye par le navigateur, qui pourrait etre perime ou falsifie.
 *
 * L'appel est authentifie par un secret partage : le canvas ne connait pas les
 * droits projet, c'est au core de les avoir verifies avant d'appeler.
 */
@Injectable()
export class CanvasClientService {
  private readonly logger = new Logger(CanvasClientService.name);

  constructor(private readonly config: ConfigService) {}

  async fetchExport(canvasId: string): Promise<CanvasExport> {
    const baseUrl = this.config.get<string>('canvas.url')!;
    const secret = this.config.get<string>('canvas.internalSecret')!;
    const url = `${baseUrl.replace(/\/$/, '')}/canvas/${encodeURIComponent(canvasId)}/export`;

    let response: Response;
    try {
      response = await fetch(url, {
        headers: { 'X-Internal-Secret': secret },
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      this.logger.error(`Canvas service unreachable at ${url}`, error);
      throw new ServiceUnavailableException('Canvas service unreachable');
    }

    if (!response.ok) {
      this.logger.error(
        `Canvas export failed for ${canvasId}: HTTP ${response.status}`,
      );
      throw new ServiceUnavailableException('Failed to export canvas');
    }

    return (await response.json()) as CanvasExport;
  }
}
