import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { ProjectFile } from '../../contracts/index.js';
import { ProjectFileEntity, UserEntity } from '../../entities/index.js';
import { ApiError } from '../../common/errors/api-error.js';
import { toProjectFile } from '../../common/mappers/index.js';
import { StorageService } from '../../common/storage/storage.service.js';
import {
  assertAllowed,
  assertSize,
  detectMimeType,
  type UploadedFile,
} from '../../common/http/upload.js';
import { ProjectAccessService } from '../projects/project-access.service.js';

@Injectable()
export class FilesService {
  constructor(
    @InjectRepository(ProjectFileEntity)
    private readonly files: Repository<ProjectFileEntity>,
    private readonly config: ConfigService,
    private readonly storage: StorageService,
    private readonly access: ProjectAccessService,
  ) {}

  /** R-F4 : les fichiers d'un projet public sont publics, comme sa fiche. */
  async list(
    slug: string,
    viewer: UserEntity | undefined,
  ): Promise<ProjectFile[]> {
    const project = await this.access.findBySlugOrFail(slug);
    await this.access.assertCanView(project, viewer);

    const rows = await this.files.find({
      where: { projectId: project.id },
      order: { uploadedAt: 'DESC' },
    });
    return rows.map(toProjectFile);
  }

  async upload(
    slug: string,
    user: UserEntity,
    file: UploadedFile,
  ): Promise<ProjectFile> {
    const project = await this.access.findBySlugOrFail(slug);
    await this.access.assertRole(project, user, 'member');

    const maxFile = this.config.get<number>('files.maxFileBytes')!;
    const maxProject = this.config.get<number>('files.maxProjectBytes')!;

    // R-F1 : la taille du fichier est verifiee avant toute ecriture objet, et
    // celle du projet juste avant l'insertion. Deux depots simultanes tout
    // pres de la limite peuvent la franchir de peu : acceptable a ce volume,
    // et bien moins couteux qu'un verrou sur le projet.
    assertSize(file.size, maxFile);

    const used = await this.usedBytes(project.id);
    if (used + file.size > maxProject) {
      throw ApiError.validation(
        `Ce projet a atteint sa limite de ${Math.round(maxProject / (1024 * 1024))} Mo de fichiers.`,
      );
    }

    // R-F2 : le type reel prime sur l'extension et sur le type annonce.
    const mimeType = detectMimeType(file);
    assertAllowed(
      mimeType,
      this.config.get<string[]>('files.allowedMimePrefixes')!,
      this.config.get<string[]>('files.allowedMimeTypes')!,
    );

    const { key } = await this.storage.put(
      `projects/${project.id}`,
      file.originalname,
      file.buffer,
      mimeType,
    );

    const stored = await this.files.save(
      this.files.create({
        projectId: project.id,
        uploadedBy: user.id,
        name: file.originalname.slice(0, 255),
        size: String(file.size),
        mimeType,
        storageKey: key,
      }),
    );

    await this.access.touch(project.id);
    return toProjectFile(stored);
  }

  /** R-F3 : le deposant, le porteur et les co-porteurs peuvent supprimer. */
  async remove(user: UserEntity, fileId: string): Promise<void> {
    const file = await this.files.findOne({ where: { id: fileId } });
    if (!file) throw ApiError.notFound("Ce fichier n'existe pas.");

    const project = await this.access.findByIdOrFail(file.projectId);
    if (file.uploadedBy !== user.id) {
      await this.access.assertRole(project, user, 'co_owner');
    } else {
      await this.access.assertRole(project, user, 'member');
    }

    await this.files.delete({ id: file.id });
    await this.storage.remove(file.storageKey);
    await this.access.touch(project.id);
  }

  private async usedBytes(projectId: string): Promise<number> {
    const { total } = (await this.files
      .createQueryBuilder('file')
      .select('COALESCE(SUM(file.size), 0)', 'total')
      .where('file.projectId = :projectId', { projectId })
      .getRawOne<{ total: string }>())!;

    return Number(total);
  }
}
