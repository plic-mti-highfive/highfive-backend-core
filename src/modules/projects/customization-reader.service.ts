import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import type { ProjectCustomization } from '../../contracts/index.js';
import {
  ProjectEntity,
  ProjectImageEntity,
  type StoredCustomization,
} from '../../entities/index.js';
import { StorageService } from '../../common/storage/storage.service.js';

/** Ids d'images references par une personnalisation (banniere + galerie). */
export function referencedImageIds(stored: StoredCustomization): string[] {
  return [
    ...(stored.banner ? [stored.banner.imageId] : []),
    ...stored.gallery.map((item) => item.imageId),
  ];
}

/**
 * Remplace les references par les URL. Une reference sans URL (image
 * disparue, ce que le cycle de vie ne devrait pas permettre) est omise :
 * mieux vaut une fiche sans cette image qu'une reponse hors contrat que le
 * front rejetterait en entier.
 */
export function materialize(
  stored: StoredCustomization,
  urls: ReadonlyMap<string, string>,
): { customization: ProjectCustomization; missing: string[] } {
  const missing = referencedImageIds(stored).filter((id) => !urls.has(id));
  const bannerUrl = stored.banner && urls.get(stored.banner.imageId);
  return {
    customization: {
      ...(stored.banner && bannerUrl
        ? {
            banner: {
              id: stored.banner.imageId,
              url: bannerUrl,
              alt: stored.banner.alt,
              focal: { x: stored.banner.focal.x, y: stored.banner.focal.y },
            },
          }
        : {}),
      // Reconstruits champ a champ : Postgres reordonne les cles d'un
      // `jsonb`, la reponse garde l'ordre du contrat.
      ...(stored.theme
        ? {
            theme: {
              background: stored.theme.background,
              panel: stored.theme.panel,
              text: stored.theme.text,
              accent: stored.theme.accent,
            },
          }
        : {}),
      sections: stored.sections.map(({ id, visible }) => ({ id, visible })),
      gallery: stored.gallery.flatMap((item) => {
        const url = urls.get(item.imageId);
        if (!url) return [];
        return [
          {
            id: item.imageId,
            url,
            alt: item.alt,
            ...(item.caption !== undefined ? { caption: item.caption } : {}),
          },
        ];
      }),
    },
    missing,
  };
}

/**
 * Lecture de la personnalisation pour les reponses `Project`. Elle vit dans
 * le module des projets, qui en a besoin pour chacune de ses sorties : le
 * module `customization` (ecriture) depend des projets, jamais l'inverse.
 */
@Injectable()
export class CustomizationReaderService {
  private readonly logger = new Logger(CustomizationReaderService.name);

  constructor(
    @InjectRepository(ProjectImageEntity)
    private readonly images: Repository<ProjectImageEntity>,
    private readonly config: ConfigService,
    private readonly storage: StorageService,
  ) {}

  /** `undefined` pour une fiche jamais personnalisee (colonne `NULL`). */
  async resolve(
    project: ProjectEntity,
  ): Promise<ProjectCustomization | undefined> {
    const stored = project.customization;
    if (!stored) return undefined;

    const ids = referencedImageIds(stored);
    // Filtre sur le projet : une reference ne sert jamais l'image d'un autre.
    const rows =
      ids.length === 0
        ? []
        : await this.images.find({
            where: { id: In(ids), projectId: project.id },
            select: { id: true, storageKey: true },
          });
    const urls = new Map(
      await Promise.all(
        rows.map(
          async (row) => [row.id, await this.urlFor(row.storageKey)] as const,
        ),
      ),
    );

    const { customization, missing } = materialize(stored, urls);
    if (missing.length > 0) {
      this.logger.error(
        `Projet ${project.id} : images referencees introuvables (${missing.join(', ')})`,
      );
    }
    return customization;
  }

  /** URL signee stable sur la fenetre configuree (cache du navigateur). */
  urlFor(storageKey: string): Promise<string> {
    return this.storage.stableSignedUrlFor(
      storageKey,
      this.config.get<number>('customization.signedUrlWindowSeconds')!,
    );
  }
}
