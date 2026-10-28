import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, IsNull, Repository } from 'typeorm';
import type {
  AdminProjectMedia,
  CustomizationImageUpload,
  Project,
  ProjectCustomization,
} from '../../contracts/index.js';
import {
  ProjectEntity,
  ProjectImageEntity,
  UserEntity,
  type StoredCustomization,
} from '../../entities/index.js';
import { ApiError } from '../../common/errors/api-error.js';
import {
  assertSize,
  detectMimeType,
  type UploadedFile,
} from '../../common/http/upload.js';
import { StorageService } from '../../common/storage/storage.service.js';
import {
  CustomizationReaderService,
  referencedImageIds,
} from '../projects/customization-reader.service.js';
import { ProjectAccessService } from '../projects/project-access.service.js';
import { ProjectsService } from '../projects/projects.service.js';
import { AdminService } from '../admin/admin.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
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

/**
 * Forme enregistree : les images par id seulement. L'`url` du corps est
 * ignoree (SPEC : jamais d'URL arbitraire), elle se recalcule a la lecture.
 */
export function toStored(input: ProjectCustomization): StoredCustomization {
  return {
    ...(input.banner
      ? {
          banner: {
            imageId: input.banner.id,
            alt: input.banner.alt,
            focal: input.banner.focal,
          },
        }
      : {}),
    ...(input.theme ? { theme: input.theme } : {}),
    sections: input.sections,
    gallery: input.gallery.map((item) => ({
      imageId: item.id,
      alt: item.alt,
      ...(item.caption !== undefined ? { caption: item.caption } : {}),
    })),
  };
}

/**
 * Personnalisation sans l'image retiree (banniere et/ou galerie), ou
 * `undefined` si elle ne la referencait pas.
 */
export function withoutImage(
  stored: StoredCustomization | null,
  imageId: string,
): StoredCustomization | undefined {
  if (!stored || !referencedImageIds(stored).includes(imageId)) {
    return undefined;
  }
  const { banner, ...rest } = stored;
  return {
    ...rest,
    ...(banner && banner.imageId !== imageId ? { banner } : {}),
    gallery: stored.gallery.filter((item) => item.imageId !== imageId),
  };
}

/**
 * Verrou de la ligne projet : les ecritures de personnalisation se suivent
 * au lieu de s'entremeler (l'une rattacherait ce que l'autre supprime).
 * Rend la personnalisation relue sous verrou. Requete sans jointure :
 * `findOne` chargerait les relations eager, et Postgres refuse
 * `FOR UPDATE` sur une jointure externe.
 */
async function lockProject(
  manager: EntityManager,
  projectId: string,
): Promise<StoredCustomization | null> {
  const locked = await manager
    .createQueryBuilder(ProjectEntity, 'project')
    .select(['project.id', 'project.customization'])
    .where('project.id = :id', { id: projectId })
    .setLock('pessimistic_write')
    .getOne();
  return locked?.customization ?? null;
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
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    private readonly storage: StorageService,
    private readonly access: ProjectAccessService,
    private readonly projects: ProjectsService,
    private readonly reader: CustomizationReaderService,
    private readonly admin: AdminService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Retrait d'une image, enregistree ou seulement deposee : par le porteur
   * (son editeur nettoie ses depots), ou par un admin qui modere. Un admin
   * agit meme sur un projet prive ou en brouillon : il doit pouvoir retirer
   * ce qu'il voit dans `GET /admin/projects/:slug/media`.
   */
  async removeImage(
    slug: string,
    user: UserEntity,
    imageId: string,
    reason: string | undefined,
  ): Promise<void> {
    const project = await this.access.findBySlugOrFail(slug);
    // Un admin sur son propre projet agit en porteur : rien a journaliser.
    const moderating =
      user.platformRole === 'admin' && project.ownerId !== user.id;
    if (!moderating) {
      await this.access.assertCanView(project, user);
      assertCanCustomize(project, user);
    }

    const keys = await this.dataSource.transaction(async (manager) => {
      const stored = await lockProject(manager, project.id);
      const images = manager.getRepository(ProjectImageEntity);
      const image = await images.findOne({
        where: { id: imageId, projectId: project.id },
      });
      if (!image) throw ApiError.notFound("Cette image n'existe pas.");

      const next = withoutImage(stored, imageId);
      if (next) {
        await manager.getRepository(ProjectEntity).update(
          { id: project.id },
          {
            customization: next,
            // Une moderation n'est pas une activite du projet (tri du fil,
            // archivage automatique R-PR6).
            ...(moderating ? {} : { lastActivityAt: new Date() }),
          },
        );
      }
      await images.delete({ id: image.id });
      return [image.storageKey, image.thumbKey].filter((key) => key !== null);
    });

    await Promise.all(keys.map((key) => this.storage.remove(key)));

    if (moderating) {
      await this.admin.journal(
        user,
        'remove_project_media',
        'project',
        project.id,
        reason,
      );
      // R-S3 : le porteur apprend qu'un media de sa fiche a ete retire.
      await this.notifications.notify({
        recipientId: project.ownerId,
        actorId: user.id,
        type: 'admin_decision',
        targetType: 'project',
        targetId: project.id,
      });
    }
  }

  /**
   * Depots jamais enregistres, passe le delai de grace (entretien
   * periodique, idempotent). Les lignes partent d'abord, sous condition :
   * un `PATCH` qui rattache l'image au meme moment verrouille sa ligne, et
   * Postgres reevalue `attached_at IS NULL` avant de supprimer — l'image
   * rattachee reste, avec ses objets.
   */
  async purgeOrphans(): Promise<number> {
    const hours = this.setting<number>('orphanImageTtlHours');
    const result = await this.images
      .createQueryBuilder()
      .delete()
      .where('attached_at IS NULL')
      .andWhere('uploaded_at < :limit', {
        limit: new Date(Date.now() - hours * 3_600_000),
      })
      // Colonnes en SQL : la forme tableau attend des noms de proprietes et
      // ignore sans erreur ce qu'elle ne reconnait pas (pas de RETURNING).
      .returning('storage_key, thumb_key')
      .execute();
    const rows = result.raw as {
      storage_key: string;
      thumb_key: string | null;
    }[];
    await Promise.all(
      rows.flatMap((row) => [
        this.storage.remove(row.storage_key),
        ...(row.thumb_key ? [this.storage.remove(row.thumb_key)] : []),
      ]),
    );
    if (rows.length) {
      this.logger.log(
        `${rows.length} image(s) jamais enregistree(s) purgee(s).`,
      );
    }
    return rows.length;
  }

  /**
   * Purge definitive d'un projet (R-X3) : tout son prefixe, objets sans
   * ligne compris. Les lignes partent avec le projet (cascade). Leve en cas
   * d'echec, pour que le projet soit repris au passage suivant.
   */
  async purgeProject(projectId: string): Promise<void> {
    await this.storage.removePrefix(`customization/${projectId}`);
  }

  /** Ce que la fiche affiche, quels que soient visibilite et etat. */
  async adminMedia(slug: string): Promise<AdminProjectMedia> {
    const project = await this.access.findBySlugOrFail(slug);
    const customization = await this.reader.resolve(project);
    return {
      ...(customization?.banner ? { banner: customization.banner } : {}),
      gallery: customization?.gallery ?? [],
    };
  }

  /**
   * Remplacement complet (`PATCH`). Rattache les images nouvellement
   * referencees et supprime celles qui ne le sont plus : le front ne
   * nettoie que les depots de sa session, une image retiree d'une
   * personnalisation deja enregistree vivrait sinon indefiniment.
   */
  async save(
    slug: string,
    user: UserEntity,
    input: ProjectCustomization,
  ): Promise<Project> {
    const project = await this.access.findBySlugOrFail(slug);
    await this.access.assertCanView(project, user);
    assertCanCustomize(project, user);

    const stored = toStored(input);
    const referenced = new Set(referencedImageIds(stored));

    const removedKeys = await this.dataSource.transaction(async (manager) => {
      await lockProject(manager, project.id);
      // Images verrouillees aussi : la purge des orphelins ne peut pas
      // retirer une image en attente pendant qu'on la rattache.
      const images = manager.getRepository(ProjectImageEntity);
      const own = await images.find({
        where: { projectId: project.id },
        lock: { mode: 'pessimistic_write' },
      });
      const ownIds = new Set(own.map((image) => image.id));
      if ([...referenced].some((id) => !ownIds.has(id))) {
        throw ApiError.validation("La demande n'est pas valide.", {
          images: "Image inconnue pour ce projet : televerse-la d'abord.",
        });
      }

      await manager
        .getRepository(ProjectEntity)
        .update(
          { id: project.id },
          { customization: stored, lastActivityAt: new Date() },
        );

      const toAttach = own.filter(
        (image) => referenced.has(image.id) && !image.attachedAt,
      );
      if (toAttach.length > 0) {
        await images.update(
          { id: In(toAttach.map((image) => image.id)) },
          { attachedAt: new Date() },
        );
      }

      // Les depots en attente ne sont pas touches : ils peuvent appartenir a
      // une edition en cours dans un autre onglet ; la purge s'en charge.
      const dropped = own.filter(
        (image) => image.attachedAt && !referenced.has(image.id),
      );
      if (dropped.length > 0) {
        await images.delete({ id: In(dropped.map((image) => image.id)) });
      }
      return dropped.flatMap((image) =>
        [image.storageKey, image.thumbKey].filter((key) => key !== null),
      );
    });

    // Apres le commit : un objet supprime pour une transaction annulee
    // laisserait une reference vers une image disparue.
    await Promise.all(removedKeys.map((key) => this.storage.remove(key)));

    return this.projects.present(await this.access.findByIdOrFail(project.id));
  }

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
      return {
        id: stored.id,
        url: await this.reader.urlFor(stored.storageKey),
      };
    } catch (error) {
      // Sans ligne en base, aucune purge ne retrouverait ces objets.
      await this.storage.remove(key);
      await this.storage.remove(thumbKey);
      this.logger.error(`Depot d'image annule: ${String(error)}`);
      throw error;
    }
  }

  private setting<T>(name: string): T {
    return this.config.get<T>(`customization.${name}`)!;
  }
}
