import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type {
  AdminProjectMedia,
  CustomizationImageUpload,
  Project,
  ProjectCustomization,
} from '../../contracts/index.js';
import {
  AdminActionEntity,
  ProjectEntity,
  UserEntity,
} from '../../entities/index.js';
import { ApiError } from '../../common/errors/api-error.js';
import {
  assertAllowed,
  assertSize,
  detectMimeType,
  type UploadedFile,
} from '../../common/http/upload.js';
import { toProject } from '../../common/mappers/index.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import {
  referencedImageIds,
  toStored,
  withoutImage,
} from './customization.logic.js';
import { ProjectAccessService } from './project-access.service.js';
import { ProjectImagesService } from './project-images.service.js';

/** Contrat : 2 Mo apres compression cote client, pas de GIF (animation perdue). */
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];

/**
 * Quota d'images televersees par projet (banniere + 8 galerie + marge pour
 * les remplacements avant nettoyage des orphelines).
 */
const MAX_PROJECT_IMAGES = 20;

@Injectable()
export class CustomizationService {
  constructor(
    @InjectRepository(ProjectEntity)
    private readonly projects: Repository<ProjectEntity>,
    @InjectRepository(AdminActionEntity)
    private readonly actions: Repository<AdminActionEntity>,
    private readonly access: ProjectAccessService,
    private readonly images: ProjectImagesService,
    private readonly notifications: NotificationsService,
  ) {}

  /** `PATCH /projects/:slug/customization` : remplace l'objet entier. */
  async update(
    slug: string,
    user: UserEntity,
    input: ProjectCustomization,
  ): Promise<Project> {
    const project = await this.ownedProject(slug, user);

    // Jamais d'URL arbitraire : seules les images televersees pour ce projet.
    const known = await this.images.idsOf(project.id);
    if (referencedImageIds(input).some((id) => !known.has(id))) {
      throw ApiError.validation(
        "Image inconnue pour ce projet : televerse-la d'abord.",
        { images: 'Image inconnue pour ce projet.' },
      );
    }

    const stored = toStored(input);
    await this.projects.update({ id: project.id }, { customization: stored });
    await this.access.touch(project.id);

    return toProject(
      { ...project, customization: stored },
      await this.images.hydrate(stored),
    );
  }

  /** `POST /projects/:slug/customization/images`. */
  async upload(
    slug: string,
    user: UserEntity,
    file: UploadedFile,
  ): Promise<CustomizationImageUpload> {
    const project = await this.ownedProject(slug, user);

    assertSize(file.size, MAX_IMAGE_BYTES);
    // R-F2 : le type reel du contenu prime sur celui que le client annonce.
    const mimeType = detectMimeType(file);
    assertAllowed(mimeType, [], ALLOWED_TYPES);
    if ((await this.images.count(project.id)) >= MAX_PROJECT_IMAGES) {
      throw ApiError.validation(
        `Ce projet a atteint sa limite de ${MAX_PROJECT_IMAGES} images.`,
      );
    }

    return this.images.add(project.id, file, mimeType);
  }

  /** `DELETE .../images/:imageId` : porteur, ou administration (moderation). */
  async remove(
    slug: string,
    user: UserEntity,
    imageId: string,
    reason: string | undefined,
  ): Promise<void> {
    const project = await this.access.findBySlugOrFail(slug);
    const isOwner = project.ownerId === user.id;
    const isAdmin = user.platformRole === 'admin';
    if (!isOwner && !isAdmin) throw ApiError.forbidden();

    const row = await this.images.find(project.id, imageId);
    if (!row) throw ApiError.notFound('Image introuvable.');

    if (project.customization) {
      await this.projects.update(
        { id: project.id },
        { customization: withoutImage(project.customization, imageId) },
      );
    }
    await this.images.remove(row);

    // R-S4 : seul le retrait du media d'un autre porteur est une decision de
    // moderation ; le porteur qui retire le sien n'est pas journalise.
    if (isAdmin && !isOwner) {
      await this.actions.save(
        this.actions.create({
          adminId: user.id,
          type: 'remove_project_media',
          targetType: 'project',
          targetId: project.id,
          reason: reason ?? null,
        }),
      );
      await this.notifications.notify({
        recipientId: project.ownerId,
        actorId: user.id,
        type: 'admin_decision',
        targetType: 'project',
        targetId: project.id,
      });
    }
  }

  /** `GET /admin/projects/:slug/media` : meme prive ou en brouillon. */
  async adminMedia(slug: string): Promise<AdminProjectMedia> {
    const project = await this.access.findBySlugOrFail(slug);
    const customization = await this.images.hydrate(project.customization);
    return {
      ...(customization?.banner && { banner: customization.banner }),
      gallery: customization?.gallery ?? [],
    };
  }

  /** Porteur seul : un co-porteur ne personnalise pas. */
  private async ownedProject(
    slug: string,
    user: UserEntity,
  ): Promise<ProjectEntity> {
    const project = await this.access.findBySlugOrFail(slug);
    if (project.ownerId !== user.id) throw ApiError.forbidden();
    return project;
  }
}
