import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import type {
  Comment as CommentDto,
  CommentCreateInput,
  UserSummary,
} from '../../contracts/index.js';
import {
  CommentEntity,
  MembershipEntity,
  UserEntity,
} from '../../entities/index.js';
import { ApiError } from '../../common/errors/api-error.js';
import { toComment, toUserSummary } from '../../common/mappers/index.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { ProjectAccessService } from '../projects/project-access.service.js';

export interface CommentWithAuthor extends CommentDto {
  author: UserSummary;
}

@Injectable()
export class CommentsService {
  constructor(
    @InjectRepository(CommentEntity)
    private readonly comments: Repository<CommentEntity>,
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    @InjectRepository(MembershipEntity)
    private readonly memberships: Repository<MembershipEntity>,
    private readonly access: ProjectAccessService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * R-C1/R-V5 : les commentaires suivent la visibilite de la fiche. Les
   * commentaires masques ne sont renvoyes a personne, pas meme a qui les a
   * masques : la moderation se lit dans l'espace d'administration, pas sur la
   * fiche.
   *
   * R-V8 : deux personnes bloquees l'une pour l'autre sur ce projet ne voient
   * plus leurs commentaires reciproques.
   */
  async list(
    slug: string,
    viewer: UserEntity | undefined,
  ): Promise<CommentWithAuthor[]> {
    const project = await this.access.findBySlugOrFail(slug);
    await this.access.assertCanView(project, viewer);

    const rows = await this.comments.find({
      where: { projectId: project.id, hidden: false },
      order: { publishedAt: 'ASC' },
    });

    const blockedIds = await this.blockedUserIds(project.id);
    const visible = rows.filter((row) => !blockedIds.has(row.authorId));

    const authors = await this.users.find({
      where: { id: In(visible.map((row) => row.authorId)) },
    });
    const byId = new Map(authors.map((user) => [user.id, user]));

    return visible
      .filter((row) => byId.has(row.authorId))
      .map((row) => ({
        ...toComment(row),
        author: toUserSummary(byId.get(row.authorId)!),
      }));
  }

  async create(
    slug: string,
    author: UserEntity,
    input: CommentCreateInput,
  ): Promise<CommentDto> {
    const project = await this.access.findBySlugOrFail(slug);
    await this.access.assertCanView(project, author);

    // R-C2 : un compte suspendu ne commente plus.
    if (author.accountStatus !== 'active') {
      throw ApiError.forbidden(
        'Ton compte est suspendu : tu ne peux pas commenter.',
      );
    }

    const membership = await this.memberships.findOne({
      where: { projectId: project.id, userId: author.id },
    });
    if (membership?.blocked) {
      throw ApiError.forbidden('Tu ne peux pas commenter sur ce projet.');
    }

    let parent: CommentEntity | null = null;
    if (input.parentId) {
      parent = await this.comments.findOne({
        where: { id: input.parentId, projectId: project.id },
      });
      if (!parent) {
        throw ApiError.notFound("Ce commentaire n'existe pas.");
      }
      // R-C4 : un seul niveau. Repondre a une reponse rattache la nouvelle
      // reponse au commentaire racine plutot que de creer un fil profond ?
      // Non : le contrat parle d'un refus explicite, on refuse.
      if (parent.parentId) {
        throw ApiError.validation(
          'On ne repond pas a une reponse : reponds au commentaire d origine.',
        );
      }
    }

    const comment = await this.comments.save(
      this.comments.create({
        projectId: project.id,
        authorId: author.id,
        body: input.body,
        parentId: parent?.id ?? null,
        hidden: false,
      }),
    );

    if (parent) {
      await this.notifications.notify({
        recipientId: parent.authorId,
        actorId: author.id,
        type: 'reply_to_comment',
        targetType: 'comment',
        targetId: comment.id,
      });
    } else {
      await this.notifications.notify({
        recipientId: project.ownerId,
        actorId: author.id,
        type: 'comment_on_project',
        targetType: 'project',
        targetId: project.id,
      });
    }

    await this.access.touch(project.id);
    return toComment(comment);
  }

  /** R-C3 : masquer revient au porteur, aux co-porteurs et a l'administration. */
  async hide(actor: UserEntity, commentId: string): Promise<void> {
    const comment = await this.findOrFail(commentId);

    if (actor.platformRole !== 'admin') {
      const project = await this.access.findByIdOrFail(comment.projectId);
      await this.access.assertRole(project, actor, 'co_owner');
    }

    await this.comments.update({ id: comment.id }, { hidden: true });
  }

  /** R-C3 : seule l'administration supprime reellement un commentaire. */
  async remove(actor: UserEntity, commentId: string): Promise<void> {
    if (actor.platformRole !== 'admin') {
      throw ApiError.forbidden(
        "Seule l'administration peut supprimer un commentaire.",
      );
    }

    const comment = await this.findOrFail(commentId);
    await this.notifications.dropForTargets('comment', [comment.id]);
    await this.comments.delete({ id: comment.id });
  }

  private async findOrFail(id: string): Promise<CommentEntity> {
    const comment = await this.comments.findOne({ where: { id } });
    if (!comment) throw ApiError.notFound("Ce commentaire n'existe pas.");
    return comment;
  }

  private async blockedUserIds(projectId: string): Promise<Set<string>> {
    const rows = await this.memberships.find({
      where: { projectId, blocked: true },
    });
    return new Set(rows.map((row) => row.userId));
  }
}
