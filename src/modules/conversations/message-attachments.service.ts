import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, LessThan, Repository } from 'typeorm';
import type {
  MessageAttachment,
  MessageAttachmentPreview,
  MessageUpload,
} from '../../contracts/index.js';
import {
  MessageEntity,
  MessageUploadEntity,
  ProjectEntity,
  ProjectFileEntity,
  UserEntity,
} from '../../entities/index.js';
import { ApiError } from '../../common/errors/api-error.js';
import {
  assertAllowed,
  assertSize,
  detectMimeType,
  type UploadedFile,
} from '../../common/http/upload.js';
import { StorageService } from '../../common/storage/storage.service.js';
import { ProjectAccessService } from '../projects/project-access.service.js';
import { assertCanWrite } from './append-message.js';
import { ConversationsService } from './conversations.service.js';

export type AttachmentColumns = Pick<
  MessageEntity,
  | 'attachmentKind'
  | 'attachmentProjectId'
  | 'attachmentFileId'
  | 'attachmentUploadId'
>;

const NO_ATTACHMENT: AttachmentColumns = {
  attachmentKind: null,
  attachmentProjectId: null,
  attachmentFileId: null,
  attachmentUploadId: null,
};

type AttachmentTarget = 'project' | 'file' | 'upload';

/**
 * Pieces jointes des messages.
 *
 * R-MSG4 — projet ou fichier de projet. Deux moments, deux regles :
 * - **a l'envoi**, l'auteur doit pouvoir voir ce qu'il joint — sans quoi on
 *   pourrait sonder l'existence d'un projet prive en le joignant ;
 * - **a la lecture**, l'apercu n'est resolu que pour qui peut voir le projet.
 *   Joindre un projet prive a quelqu'un qui n'en est pas membre ne lui en
 *   revele ni le titre ni l'accroche : il voit le message, sans apercu. Meme
 *   chose si le projet est supprime ou devient prive plus tard.
 *
 * R-MSG8 — depot propre a la conversation (image, video, fichier). Il ne se
 * lit que par les participants, d'ou un prefixe prive dans le stockage et
 * une URL signee recalculee a chaque lecture.
 */
@Injectable()
export class MessageAttachmentsService {
  private readonly logger = new Logger(MessageAttachmentsService.name);

  constructor(
    @InjectRepository(ProjectEntity)
    private readonly projects: Repository<ProjectEntity>,
    @InjectRepository(ProjectFileEntity)
    private readonly files: Repository<ProjectFileEntity>,
    @InjectRepository(MessageUploadEntity)
    private readonly uploads: Repository<MessageUploadEntity>,
    @InjectRepository(MessageEntity)
    private readonly messages: Repository<MessageEntity>,
    private readonly access: ProjectAccessService,
    private readonly conversations: ConversationsService,
    private readonly storage: StorageService,
    private readonly config: ConfigService,
  ) {}

  /**
   * R-MSG8 : premier temps du depot. Le type reel prime sur le nom et sur le
   * type annonce (comme R-F2), et decide du plafond applicable.
   */
  async upload(
    author: UserEntity,
    conversationId: string,
    file: UploadedFile,
  ): Promise<MessageUpload> {
    assertCanWrite(author);
    await this.conversations.findForParticipantOrFail(
      conversationId,
      author.id,
    );

    const mimeType = detectMimeType(file);
    if (
      this.config.get<string[]>('messages.deniedMimeTypes')!.includes(mimeType)
    ) {
      throw ApiError.validation(
        'Ce type de fichier ne peut pas etre envoye dans un message.',
      );
    }
    assertAllowed(
      mimeType,
      this.config.get<string[]>('messages.allowedMimePrefixes')!,
      this.config.get<string[]>('files.allowedMimeTypes')!,
    );
    assertSize(file.size, this.maxBytesFor(mimeType));

    const { key } = await this.storage.put(
      `messages/${conversationId}`,
      file.originalname,
      file.buffer,
      mimeType,
    );
    const stored = await this.uploads.save(
      this.uploads.create({
        conversationId,
        uploadedBy: author.id,
        fileName: file.originalname.slice(0, 255),
        size: String(file.size),
        mimeType,
        storageKey: key,
      }),
    );
    return {
      id: stored.id,
      fileName: stored.fileName,
      fileSize: Number(stored.size),
      mimeType: stored.mimeType,
    };
  }

  /** Verifie la piece jointe et la traduit en colonnes de `messages`. */
  async toColumns(
    author: UserEntity,
    conversationId: string,
    attachment: MessageAttachment | undefined,
  ): Promise<AttachmentColumns> {
    if (!attachment) return NO_ATTACHMENT;

    if (attachment.kind === 'project') {
      await this.assertVisible(author, attachment.projectId);
      return {
        ...NO_ATTACHMENT,
        attachmentKind: 'project',
        attachmentProjectId: attachment.projectId,
      };
    }

    if (attachment.kind === 'upload') {
      // R-MSG8 : un depot ne se joint qu'une fois, par son auteur, dans la
      // conversation ou il a ete fait. Tout autre cas repond comme un depot
      // inexistant. L'index unique sur `attachment_upload_id` tranche le cas
      // de deux envois simultanes.
      const upload = await this.uploads.findOne({
        where: {
          id: attachment.uploadId,
          conversationId,
          uploadedBy: author.id,
        },
      });
      const alreadyJoined =
        upload &&
        (await this.messages.exists({
          where: { attachmentUploadId: upload.id },
        }));
      if (!upload || alreadyJoined) throw notFound('upload');
      return {
        ...NO_ATTACHMENT,
        attachmentKind: 'upload',
        attachmentUploadId: upload.id,
      };
    }

    const file = await this.files.findOne({
      where: { id: attachment.fileId },
    });
    if (!file) throw notFound('file');
    // R-F4 : un fichier se voit si son projet se voit.
    await this.assertVisible(author, file.projectId, 'file');
    return {
      ...NO_ATTACHMENT,
      attachmentKind: 'file',
      attachmentFileId: file.id,
    };
  }

  /** Apercus des messages du lot, pour ce lecteur. Quatre requetes au plus. */
  async previewsFor(
    messages: MessageEntity[],
    viewer: UserEntity,
  ): Promise<Map<string, MessageAttachmentPreview>> {
    const fileIds = messages
      .map((message) => message.attachmentFileId)
      .filter((id): id is string => id !== null);
    const uploadIds = messages
      .map((message) => message.attachmentUploadId)
      .filter((id): id is string => id !== null);

    const [files, uploads] = await Promise.all([
      fileIds.length
        ? this.files.find({ where: { id: In(fileIds) } })
        : Promise.resolve([]),
      uploadIds.length
        ? this.uploads.find({ where: { id: In(uploadIds) } })
        : Promise.resolve([]),
    ]);
    const fileById = new Map(files.map((file) => [file.id, file]));

    const projectIds = [
      ...messages
        .map((message) => message.attachmentProjectId)
        .filter((id): id is string => id !== null),
      ...files.map((file) => file.projectId),
    ];
    const projects = projectIds.length
      ? await this.projects.find({
          where: { id: In([...new Set(projectIds)]), deletedAt: IsNull() },
        })
      : [];
    const visible = await this.access.visibleIds(projects, viewer);
    const projectById = new Map(
      projects
        .filter((project) => visible.has(project.id))
        .map((project) => [project.id, project]),
    );

    // La signature se calcule localement, sans appel au stockage.
    const ttl = this.config.get<number>('messages.signedUrlTtlSeconds')!;
    const uploadPreviews = new Map(
      await Promise.all(
        uploads.map(
          async (upload) =>
            [
              upload.id,
              {
                kind: 'upload',
                uploadId: upload.id,
                fileName: upload.fileName,
                fileSize: Number(upload.size),
                mimeType: upload.mimeType,
                url: await this.storage.signedUrlFor(
                  upload.storageKey,
                  ttl,
                  upload.fileName,
                ),
              },
            ] as const,
        ),
      ),
    );

    const previews = new Map<string, MessageAttachmentPreview>();
    for (const message of messages) {
      if (message.attachmentProjectId) {
        const project = projectById.get(message.attachmentProjectId);
        if (project) {
          previews.set(message.id, {
            kind: 'project',
            projectSlug: project.slug,
            projectTitle: project.title,
            projectTagline: project.tagline,
          });
        }
      }
      if (message.attachmentFileId) {
        const file = fileById.get(message.attachmentFileId);
        if (file && projectById.has(file.projectId)) {
          previews.set(message.id, {
            kind: 'file',
            fileId: file.id,
            fileName: file.name,
            // `bigint` revient en chaine depuis le pilote Postgres.
            fileSize: Number(file.size),
          });
        }
      }
      if (message.attachmentUploadId) {
        const preview = uploadPreviews.get(message.attachmentUploadId);
        if (preview) previews.set(message.id, preview);
      }
    }
    return previews;
  }

  /**
   * R-MSG6/R-MSG8 : supprimer un message supprime son depot — ligne et
   * objet. Le fichier n'a plus aucune raison d'etre conserve.
   */
  async discardUpload(uploadId: string): Promise<void> {
    const upload = await this.uploads.findOne({ where: { id: uploadId } });
    if (!upload) return;
    await this.uploads.delete({ id: upload.id });
    await this.storage.remove(upload.storageKey);
  }

  /**
   * R-MSG8 : depots jamais joints a un message, passe le delai de grace.
   * Idempotent, appele par l'entretien periodique.
   */
  async purgeOrphans(): Promise<number> {
    const hours = this.config.get<number>('messages.orphanUploadTtlHours')!;
    const orphans = await this.uploads
      .createQueryBuilder('upload')
      .where({ uploadedAt: LessThan(new Date(Date.now() - hours * 3_600_000)) })
      .andWhere(
        'NOT EXISTS (SELECT 1 FROM messages m WHERE m.attachment_upload_id = upload.id)',
      )
      .getMany();

    for (const upload of orphans) {
      await this.uploads.delete({ id: upload.id });
      await this.storage.remove(upload.storageKey);
    }
    if (orphans.length) {
      this.logger.log(
        `${orphans.length} depot(s) de message orphelin(s) purge(s).`,
      );
    }
    return orphans.length;
  }

  private maxBytesFor(mimeType: string): number {
    if (mimeType.startsWith('image/')) {
      return this.config.get<number>('messages.maxImageBytes')!;
    }
    if (mimeType.startsWith('video/')) {
      return this.config.get<number>('messages.maxVideoBytes')!;
    }
    return this.config.get<number>('messages.maxOtherBytes')!;
  }

  private async assertVisible(
    author: UserEntity,
    projectId: string,
    kind: AttachmentTarget = 'project',
  ): Promise<void> {
    const project = await this.projects.findOne({
      where: { id: projectId, deletedAt: IsNull() },
    });
    const visible = project
      ? await this.access.visibleIds([project], author)
      : new Set<string>();
    if (!visible.has(projectId)) throw notFound(kind);
  }
}

/**
 * Introuvable ou inaccessible : meme reponse, pour ne pas reveler l'existence
 * d'un projet prive ou du depot d'autrui. 400 plutot que 404, que le contrat
 * reserve ici a la conversation elle-meme.
 */
export const notFound = (kind: AttachmentTarget): ApiError =>
  ApiError.validation(
    kind === 'project'
      ? 'Ce projet est introuvable : il ne peut pas etre joint.'
      : 'Ce fichier est introuvable : il ne peut pas etre joint.',
    {
      attachment:
        kind === 'project' ? 'Projet introuvable.' : 'Fichier introuvable.',
    },
  );
