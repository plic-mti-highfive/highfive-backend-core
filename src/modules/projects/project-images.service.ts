import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThan, Repository } from 'typeorm';
import type { ProjectCustomization } from '../../contracts/index.js';
import { ProjectEntity, ProjectImageEntity } from '../../entities/index.js';
import { StorageService } from '../../common/storage/storage.service.js';
import type { UploadedFile } from '../../common/http/upload.js';
import {
  hydrate,
  referencedImageIds,
  type StoredCustomization,
} from './customization.logic.js';

/**
 * Duree de validite des URL signees. Une fiche ouverte plus longtemps verrait
 * ses images disparaitre : le front recharge le projet bien avant.
 */
const URL_TTL_SECONDS = 6 * 60 * 60;

const ORPHAN_AFTER_MS = 24 * 60 * 60 * 1000;

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
};

const fileNameOf = (mimeType: string): string =>
  `image.${EXTENSIONS[mimeType] ?? 'bin'}`;

/**
 * Images de personnalisation : lignes, objets et URL signees. Ne depend pas
 * des droits (`ProjectAccessService` l'utilise pour les cartes).
 */
@Injectable()
export class ProjectImagesService {
  constructor(
    @InjectRepository(ProjectImageEntity)
    private readonly rows: Repository<ProjectImageEntity>,
    @InjectRepository(ProjectEntity)
    private readonly projects: Repository<ProjectEntity>,
    private readonly storage: StorageService,
  ) {}

  async idsOf(projectId: string): Promise<Set<string>> {
    const rows = await this.rows.find({
      where: { projectId },
      select: { id: true },
    });
    return new Set(rows.map((row) => row.id));
  }

  count(projectId: string): Promise<number> {
    return this.rows.count({ where: { projectId } });
  }

  find(projectId: string, id: string): Promise<ProjectImageEntity | null> {
    return this.rows.findOne({ where: { id, projectId } });
  }

  async add(
    projectId: string,
    file: UploadedFile,
    mimeType: string,
  ): Promise<{ id: string; url: string }> {
    // Nom fixe : l'extension d'origine est choisie par l'appelant, le type
    // verifie du contenu, non.
    const { key } = await this.storage.put(
      `customization/${projectId}`,
      fileNameOf(mimeType),
      file.buffer,
      mimeType,
    );
    const row = await this.rows.save(
      this.rows.create({
        projectId,
        mimeType,
        size: file.size,
        storageKey: key,
      }),
    );
    return { id: row.id, url: await this.sign(row) };
  }

  async remove(row: ProjectImageEntity): Promise<void> {
    await this.rows.delete({ id: row.id });
    await this.storage.remove(row.storageKey);
  }

  async urlsFor(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const rows = await this.rows.find({ where: { id: In(ids) } });
    // La signature se calcule localement, sans appel au stockage.
    return new Map(
      await Promise.all(
        rows.map(async (row) => [row.id, await this.sign(row)] as const),
      ),
    );
  }

  async hydrate(
    stored: StoredCustomization | null | undefined,
  ): Promise<ProjectCustomization | undefined> {
    if (!stored) return undefined;
    return hydrate(stored, await this.urlsFor(referencedImageIds(stored)));
  }

  /**
   * Images televersees mais jamais referencees apres 24 h : le depot en deux
   * temps (upload, puis PATCH) en laisse a chaque abandon de l'editeur.
   */
  async purgeOrphans(): Promise<void> {
    const old = await this.rows.find({
      where: { uploadedAt: LessThan(new Date(Date.now() - ORPHAN_AFTER_MS)) },
    });
    if (old.length === 0) return;

    const projects = await this.projects.find({
      where: { id: In([...new Set(old.map((row) => row.projectId))]) },
    });
    const referenced = new Set(
      projects.flatMap((project) =>
        project.customization ? referencedImageIds(project.customization) : [],
      ),
    );
    for (const row of old.filter((row) => !referenced.has(row.id))) {
      await this.remove(row);
    }
  }

  private sign(row: ProjectImageEntity): Promise<string> {
    return this.storage.signedUrlFor(
      row.storageKey,
      URL_TTL_SECONDS,
      fileNameOf(row.mimeType),
    );
  }
}
