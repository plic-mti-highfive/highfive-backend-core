import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import type { CustomizationImageUpload } from '../../contracts/index.js';
import {
  ProjectEntity,
  ProjectImageEntity,
  UserEntity,
} from '../../entities/index.js';
import { ApiError } from '../../common/errors/api-error.js';
import {
  assertSize,
  detectMimeType,
  type UploadedFile,
} from '../../common/http/upload.js';
import { StorageService } from '../../common/storage/storage.service.js';
import { ProjectAccessService } from '../projects/project-access.service.js';
import { makeThumbnail } from './thumbnail.js';

/** Extension de l'objet stocke, tiree du type reel et jamais du nom envoye. */
const EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
};

/**
 * Personnalisation : le porteur seul, compte actif. Un co-porteur modifie
 * les infos de la fiche, pas son apparence (decision produit, SPEC).
 */
export function assertCanCustomize(
  project: ProjectEntity,
  user: UserEntity,
): void {
  if (project.ownerId !== user.id) {
    throw ApiError.forbidden(
      'Seul le porteur du projet personnalise sa fiche.',
    );
  }
  if (user.accountStatus !== 'active') {
    throw ApiError.forbidden(
      'Ton compte est suspendu : tu ne peux pas personnaliser ta fiche.',
    );
  }
}

/** La miniature est rangee a cote de l'original : `<cle sans extension>-640.webp`. */
export function thumbKeyFor(storageKey: string, width: number): string {
  return `${storageKey.replace(/\.[a-z0-9]+$/, '')}-${width}.webp`;
}

@Injectable()
export class CustomizationService {
  private readonly logger = new Logger(CustomizationService.name);

  constructor(
    @InjectRepository(ProjectImageEntity)
    private readonly images: Repository<ProjectImageEntity>,
    private readonly config: ConfigService,
    private readonly storage: StorageService,
    private readonly access: ProjectAccessService,
  ) {}

  /**
   * Premier temps du depot : l'image est stockee mais referencee par aucune
   * fiche. Le `PATCH` suivant la rattache ; sinon l'entretien la purge.
   */
  async upload(
    slug: string,
    user: UserEntity,
    file: UploadedFile,
  ): Promise<CustomizationImageUpload> {
    const project = await this.access.findBySlugOrFail(slug);
    // Un projet invisible repond comme ailleurs (404 brouillon, 403 prive)
    // avant toute question de droit, pour ne rien reveler de plus.
    await this.access.assertCanView(project, user);
    assertCanCustomize(project, user);

    assertSize(file.size, this.setting<number>('maxImageBytes'));
    const mimeType = detectMimeType(file);
    if (!this.setting<string[]>('allowedMimeTypes').includes(mimeType)) {
      throw ApiError.validation(
        'Format non pris en charge : JPEG, PNG, WebP ou AVIF seulement.',
      );
    }

    // Deux depots simultanes peuvent depasser le plafond d'une image : sans
    // consequence, il ne borne que l'accumulation.
    const maxPending = this.setting<number>('maxPendingImages');
    const pending = await this.images.count({
      where: { projectId: project.id, attachedAt: IsNull() },
    });
    if (pending >= maxPending) {
      throw ApiError.validation(
        `Ce projet a deja ${maxPending} images non enregistrees : enregistre ou retire-en avant d'en ajouter.`,
      );
    }

    // Avant tout ecrit : une image qui ne se decode pas s'arrete ici.
    const width = this.setting<number>('thumbnailWidth');
    const thumbnail = await makeThumbnail(file.buffer, width);

    const { key } = await this.storage.put(
      `customization/${project.id}`,
      `image.${EXTENSION[mimeType]}`,
      file.buffer,
      mimeType,
    );
    const thumbKey = thumbKeyFor(key, width);
    try {
      await this.storage.putAt(thumbKey, thumbnail, 'image/webp');
      const stored = await this.images.save(
        this.images.create({
          projectId: project.id,
          uploadedBy: user.id,
          mimeType,
          size: file.size,
          storageKey: key,
          thumbKey,
        }),
      );
      return { id: stored.id, url: await this.urlFor(stored.storageKey) };
    } catch (error) {
      // Sans ligne en base, aucune purge ne retrouverait ces objets.
      await this.storage.remove(key);
      await this.storage.remove(thumbKey);
      this.logger.error(`Depot d'image annule: ${String(error)}`);
      throw error;
    }
  }

  /** URL signee stable sur la fenetre configuree (cache du navigateur). */
  urlFor(storageKey: string): Promise<string> {
    return this.storage.stableSignedUrlFor(
      storageKey,
      this.setting<number>('signedUrlWindowSeconds'),
    );
  }

  private setting<T>(name: string): T {
    return this.config.get<T>(`customization.${name}`)!;
  }
}
