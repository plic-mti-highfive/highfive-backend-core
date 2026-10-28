import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import {
  ProjectEntity,
  ProjectImageEntity,
  type StoredCustomization,
} from '../../entities/index.js';
import { StorageService } from '../../common/storage/storage.service.js';
import { thumbKeyFor } from './customization.service.js';
import { makeThumbnail } from './thumbnail.js';

/** Image referencee par la premiere implementation (PR #5) : `id`, pas `imageId`. */
type LegacyImageRef = { id?: string; imageId?: string };

/**
 * Remet au format courant une base qui a fait tourner la premiere
 * implementation de la personnalisation (PR #5, fusionnee puis remplacee).
 * Le projet n'a pas de migrations (le schema vit de la synchronisation) :
 * la conversion se fait donc au demarrage, apres la synchronisation, et elle
 * est idempotente — sans donnee heritee, elle ne coute que trois requetes.
 *
 * `onModuleInit` : Nest attend ce hook avant ceux des modules qui importent
 * celui-ci, donc avant le premier passage de l'entretien, dont la purge des
 * orphelins supprimerait sinon les images heritees (non rattachees).
 */
@Injectable()
export class LegacyCustomizationService implements OnModuleInit {
  private readonly logger = new Logger(LegacyCustomizationService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(ProjectImageEntity)
    private readonly images: Repository<ProjectImageEntity>,
    private readonly storage: StorageService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      const projects = await this.renameImageRefs();
      const attached = await this.attachReferenced();
      const owners = await this.fillUploaders();
      const thumbs = await this.makeMissingThumbnails();
      if (projects || attached || owners || thumbs) {
        this.logger.log(
          `Personnalisations heritees converties : ${projects} fiche(s), ${attached} image(s) rattachee(s), ${owners} deposant(s), ${thumbs} miniature(s).`,
        );
      }
    } catch (error) {
      // Ne bloque pas le demarrage : une fiche non convertie perd ses images
      // a l'affichage (references omises), elle ne casse rien.
      this.logger.error(`Conversion des personnalisations: ${String(error)}`);
    }
  }

  /** `banner.id` / `gallery[].id` deviennent `imageId`. */
  private async renameImageRefs(): Promise<number> {
    const repository = this.dataSource.getRepository(ProjectEntity);
    const rows = await repository
      .createQueryBuilder('project')
      .select(['project.id', 'project.customization'])
      .where(
        `project.customization->'banner' ? 'id' OR jsonb_path_exists(project.customization, '$.gallery[*].id')`,
      )
      .getMany();

    for (const row of rows) {
      const legacy = row.customization as unknown as Omit<
        StoredCustomization,
        'banner' | 'gallery'
      > & {
        banner?: LegacyImageRef & StoredCustomization['banner'];
        gallery: (LegacyImageRef & StoredCustomization['gallery'][number])[];
      };
      const imageIdOf = (ref: LegacyImageRef) => ref.imageId ?? ref.id ?? '';
      const { banner, gallery, ...rest } = legacy;
      const converted: StoredCustomization = {
        ...rest,
        ...(banner
          ? {
              banner: {
                imageId: imageIdOf(banner),
                alt: banner.alt,
                focal: banner.focal,
              },
            }
          : {}),
        gallery: gallery.map((item) => ({
          imageId: imageIdOf(item),
          alt: item.alt,
          ...(item.caption !== undefined ? { caption: item.caption } : {}),
        })),
      };
      await repository.update({ id: row.id }, { customization: converted });
    }
    return rows.length;
  }

  /** La PR #5 ne notait pas le rattachement : on le deduit des references. */
  private async attachReferenced(): Promise<number> {
    const [, affected] = await this.dataSource.query<[unknown, number]>(
      `UPDATE project_images i SET attached_at = i.uploaded_at
         FROM projects p
        WHERE i.project_id = p.id
          AND i.attached_at IS NULL
          AND (p.customization->'banner'->>'imageId' = i.id::text
               OR EXISTS (SELECT 1 FROM jsonb_array_elements(p.customization->'gallery') g
                           WHERE g->>'imageId' = i.id::text))`,
    );
    return affected;
  }

  /** Seul le porteur pouvait deposer : il est le deposant. */
  private async fillUploaders(): Promise<number> {
    const [, affected] = await this.dataSource.query<[unknown, number]>(
      `UPDATE project_images i SET uploaded_by = p.owner_id
         FROM projects p
        WHERE i.project_id = p.id AND i.uploaded_by IS NULL`,
    );
    return affected;
  }

  private async makeMissingThumbnails(): Promise<number> {
    const width = this.config.get<number>('customization.thumbnailWidth')!;
    const rows = await this.images.find({ where: { thumbKey: IsNull() } });
    let made = 0;
    for (const row of rows) {
      try {
        const thumbnail = await makeThumbnail(
          await this.storage.read(row.storageKey),
          width,
        );
        const thumbKey = thumbKeyFor(row.storageKey, width);
        await this.storage.putAt(thumbKey, thumbnail, 'image/webp');
        await this.images.update({ id: row.id }, { thumbKey });
        made += 1;
      } catch (error) {
        // La carte sert l'original : moins leger, mais juste.
        this.logger.warn(
          `Miniature de l'image ${row.id} non produite: ${String(error)}`,
        );
      }
    }
    return made;
  }
}
