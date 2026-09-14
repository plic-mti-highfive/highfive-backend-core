import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import type {
  Invitation,
  InvitationCreateInput,
  JoinRequest,
  JoinRequestCreateInput,
  Membership,
  MembershipRole,
} from '../../contracts/index.js';
import {
  InvitationEntity,
  JoinRequestEntity,
  MembershipEntity,
  ProjectEntity,
  UserEntity,
} from '../../entities/index.js';
import { ApiError } from '../../common/errors/api-error.js';
import {
  toInvitation,
  toJoinRequest,
  toMembership,
  toUserSummary,
} from '../../common/mappers/index.js';
import type { UserSummary } from '../../contracts/index.js';
import { AiEventsService } from '../../common/ai/ai-events.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { ProjectAccessService } from '../projects/project-access.service.js';

export interface TeamMember extends Membership {
  user: UserSummary;
}

/** R-I1 : une invitation vaut 30 jours. */
const INVITATION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** R-D2 : une demande refusee ne se renouvelle qu'apres 30 jours. */
const REJECTED_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

@Injectable()
export class MembershipsService {
  constructor(
    @InjectRepository(MembershipEntity)
    private readonly memberships: Repository<MembershipEntity>,
    @InjectRepository(JoinRequestEntity)
    private readonly joinRequests: Repository<JoinRequestEntity>,
    @InjectRepository(InvitationEntity)
    private readonly invitations: Repository<InvitationEntity>,
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    private readonly dataSource: DataSource,
    private readonly access: ProjectAccessService,
    private readonly notifications: NotificationsService,
    private readonly ai: AiEventsService,
  ) {}

  async listMembers(
    slug: string,
    viewer: UserEntity | undefined,
  ): Promise<TeamMember[]> {
    const project = await this.access.findBySlugOrFail(slug);
    await this.access.assertCanView(project, viewer);

    const rows = await this.memberships.find({
      where: { projectId: project.id },
      order: { joinedAt: 'ASC' },
    });
    const users = await this.users.find({
      where: { id: In(rows.map((row) => row.userId)) },
    });
    const byId = new Map(users.map((user) => [user.id, user]));

    return rows
      .filter((row) => byId.has(row.userId))
      .map((row) => ({
        ...toMembership(row),
        user: toUserSummary(byId.get(row.userId)!),
      }));
  }

  /** Nommer ou retirer un co-porteur : decision du porteur seul (doc 05 §3.2). */
  async updateRole(
    slug: string,
    actor: UserEntity,
    userId: string,
    role: MembershipRole,
  ): Promise<Membership> {
    const project = await this.access.findBySlugOrFail(slug);
    if (project.ownerId !== actor.id) {
      throw ApiError.forbidden(
        'Seul le porteur peut changer les roles de son equipe.',
      );
    }
    // R-M1 : la propriete ne se donne pas par un changement de role, elle se
    // transfere (`POST /projects/:slug/transfer`).
    if (role === 'owner') {
      throw ApiError.validation(
        'Pour donner le projet, utilise le transfert de propriete.',
      );
    }

    const membership = await this.memberships.findOne({
      where: { projectId: project.id, userId },
    });
    if (!membership)
      throw ApiError.notFound("Cette personne n'est pas dans l'equipe.");
    if (membership.role === 'owner') {
      throw ApiError.forbidden('Le porteur garde son role.');
    }

    membership.role = role;
    await this.memberships.save(membership);
    await this.access.touch(project.id);

    return toMembership(membership);
  }

  /** R-M4 : exclure retire la ligne. Le porteur ne peut pas etre exclu. */
  async removeMember(
    slug: string,
    actor: UserEntity,
    userId: string,
  ): Promise<void> {
    const project = await this.access.findBySlugOrFail(slug);
    await this.access.assertRole(project, actor, 'co_owner');

    if (userId === project.ownerId) {
      throw ApiError.forbidden(
        'Le porteur ne peut pas etre exclu de son projet.',
      );
    }

    await this.memberships.delete({ projectId: project.id, userId });
    await this.access.touch(project.id);
  }

  /**
   * R-M4 : bloquer conserve la ligne avec `blocked = true`. C'est ce qui
   * empeche de revenir par une demande ou une invitation — une simple
   * exclusion, elle, se contournerait en redemandant.
   */
  async blockMember(
    slug: string,
    actor: UserEntity,
    userId: string,
  ): Promise<void> {
    const project = await this.access.findBySlugOrFail(slug);
    await this.access.assertRole(project, actor, 'co_owner');

    if (userId === project.ownerId) {
      throw ApiError.forbidden('Le porteur ne peut pas etre bloque.');
    }

    const membership = await this.memberships.findOne({
      where: { projectId: project.id, userId },
    });

    if (membership) {
      membership.blocked = true;
      await this.memberships.save(membership);
    } else {
      // Bloquer une personne qui n'est pas (ou plus) dans l'equipe doit rester
      // possible : c'est justement le cas ou l'on veut l'empecher d'entrer.
      await this.memberships.save(
        this.memberships.create({
          projectId: project.id,
          userId,
          role: 'observer',
          blocked: true,
        }),
      );
    }
  }

  /** R-M3 : le porteur transfere ou archive avant de partir. */
  async leave(slug: string, user: UserEntity): Promise<void> {
    const project = await this.access.findBySlugOrFail(slug);

    if (project.ownerId === user.id) {
      throw ApiError.forbidden(
        'Transfere ou archive le projet avant de le quitter.',
      );
    }

    await this.memberships.delete({ projectId: project.id, userId: user.id });
  }

  async listJoinRequests(
    slug: string,
    actor: UserEntity,
  ): Promise<JoinRequest[]> {
    const project = await this.access.findBySlugOrFail(slug);
    await this.access.assertRole(project, actor, 'co_owner');

    const rows = await this.joinRequests.find({
      where: { projectId: project.id },
      order: { createdAt: 'DESC' },
    });
    return rows.map(toJoinRequest);
  }

  /**
   * `open` accepte d'emblee, `on_request` cree une demande en attente,
   * `on_invite` refuse : ce sont les trois facons de rejoindre, et elles se
   * decident ici et nulle part ailleurs.
   */
  async createJoinRequest(
    slug: string,
    user: UserEntity,
    input: JoinRequestCreateInput,
  ): Promise<JoinRequest> {
    const project = await this.access.findBySlugOrFail(slug);
    await this.access.assertCanView(project, user);

    if (user.accountStatus !== 'active') {
      throw ApiError.forbidden(
        'Ton compte est suspendu : tu ne peux pas rejoindre de projet.',
      );
    }
    if (project.participation === 'on_invite') {
      throw ApiError.forbidden('Ce projet ne se rejoint que sur invitation.');
    }

    const membership = await this.memberships.findOne({
      where: { projectId: project.id, userId: user.id },
    });
    if (membership?.blocked) {
      throw ApiError.forbidden('Tu ne peux pas rejoindre ce projet.');
    }
    if (membership) {
      throw ApiError.conflict('Tu fais deja partie de ce projet.');
    }

    const previous = await this.joinRequests.find({
      where: { projectId: project.id, userId: user.id },
      order: { createdAt: 'DESC' },
    });

    if (previous.some((request) => request.status === 'pending')) {
      throw ApiError.conflict('Ta demande est deja en attente.');
    }

    const lastRejected = previous.find(
      (request) => request.status === 'rejected',
    );
    if (
      lastRejected?.decidedAt &&
      Date.now() - lastRejected.decidedAt.getTime() < REJECTED_COOLDOWN_MS
    ) {
      throw ApiError.conflict(
        'Ta demande a ete refusee recemment : tu pourras redemander dans quelques semaines.',
      );
    }

    const autoAccepted = project.participation === 'open';

    const request = await this.dataSource.transaction(async (manager) => {
      const created = await manager.save(
        manager.create(JoinRequestEntity, {
          projectId: project.id,
          userId: user.id,
          message: input.message ?? null,
          status: autoAccepted ? 'accepted' : 'pending',
          decidedAt: autoAccepted ? new Date() : null,
        }),
      );

      if (autoAccepted) {
        await manager.save(
          manager.create(MembershipEntity, {
            projectId: project.id,
            userId: user.id,
            role: 'member',
          }),
        );
      }

      return created;
    });

    if (autoAccepted) {
      await this.announceNewMember(project, user.id);
    } else {
      await this.notifications.notifyMany(await this.leadersOf(project.id), {
        actorId: user.id,
        type: 'join_request_received',
        targetType: 'project',
        targetId: project.id,
      });
    }

    await this.ai.userInteracted({
      userId: user.id,
      projectId: project.id,
      kind: 'apply',
    });
    await this.access.touch(project.id);

    return toJoinRequest(request);
  }

  async acceptJoinRequest(
    slug: string,
    actor: UserEntity,
    requestId: string,
  ): Promise<void> {
    const { project, request } = await this.leadJoinRequest(
      slug,
      actor,
      requestId,
    );

    await this.dataSource.transaction(async (manager) => {
      await manager.update(
        JoinRequestEntity,
        { id: request.id },
        { status: 'accepted', decidedAt: new Date() },
      );

      const existing = await manager.findOne(MembershipEntity, {
        where: { projectId: project.id, userId: request.userId },
      });
      if (!existing) {
        await manager.save(
          manager.create(MembershipEntity, {
            projectId: project.id,
            userId: request.userId,
            role: 'member',
          }),
        );
      }
    });

    await this.notifications.notify({
      recipientId: request.userId,
      actorId: actor.id,
      type: 'join_request_accepted',
      targetType: 'project',
      targetId: project.id,
    });
    await this.announceNewMember(project, request.userId);
    await this.access.touch(project.id);
  }

  /** R-D3 : un refus ne transporte aucun motif — inutile de blesser. */
  async rejectJoinRequest(
    slug: string,
    actor: UserEntity,
    requestId: string,
  ): Promise<void> {
    const { project, request } = await this.leadJoinRequest(
      slug,
      actor,
      requestId,
    );

    await this.joinRequests.update(
      { id: request.id },
      { status: 'rejected', decidedAt: new Date() },
    );

    await this.notifications.notify({
      recipientId: request.userId,
      actorId: actor.id,
      type: 'join_request_rejected',
      targetType: 'project',
      targetId: project.id,
    });
  }

  async listInvitations(
    slug: string,
    actor: UserEntity,
  ): Promise<Invitation[]> {
    const project = await this.access.findBySlugOrFail(slug);
    await this.access.assertRole(project, actor, 'co_owner');

    const rows = await this.invitations.find({
      where: { projectId: project.id },
      order: { createdAt: 'DESC' },
    });
    return rows.map(toInvitation);
  }

  async createInvitation(
    slug: string,
    actor: UserEntity,
    input: InvitationCreateInput,
  ): Promise<Invitation> {
    const project = await this.access.findBySlugOrFail(slug);
    await this.access.assertRole(project, actor, 'co_owner');

    const recipient = await this.users.findOne({
      where: { id: input.recipientId },
    });
    if (!recipient || recipient.deletedAt) {
      throw ApiError.notFound('Cette personne est introuvable.');
    }

    const membership = await this.memberships.findOne({
      where: { projectId: project.id, userId: input.recipientId },
    });
    // R-I3 : inviter une personne bloquee reviendrait a annuler le blocage
    // sans le dire.
    if (membership?.blocked) {
      throw ApiError.forbidden('Cette personne est bloquee sur ce projet.');
    }
    if (membership) {
      throw ApiError.conflict("Cette personne fait deja partie de l'equipe.");
    }

    const pending = await this.invitations.findOne({
      where: {
        projectId: project.id,
        recipientId: input.recipientId,
        status: 'pending',
      },
    });
    if (pending && pending.expiresAt.getTime() > Date.now()) {
      throw ApiError.conflict('Cette personne a deja une invitation en cours.');
    }

    const invitation = await this.invitations.save(
      this.invitations.create({
        projectId: project.id,
        senderId: actor.id,
        recipientId: input.recipientId,
        proposedRole: input.proposedRole,
        message: input.message ?? null,
        status: 'pending',
        expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
      }),
    );

    await this.notifications.notify({
      recipientId: input.recipientId,
      actorId: actor.id,
      type: 'invitation_received',
      targetType: 'project',
      targetId: project.id,
    });

    return toInvitation(invitation);
  }

  /** R-I2 : accepter cree l'appartenance au role propose, pas un autre. */
  async acceptInvitation(
    user: UserEntity,
    invitationId: string,
  ): Promise<void> {
    const invitation = await this.ownInvitation(user, invitationId);
    const project = await this.access.findByIdOrFail(invitation.projectId);

    await this.dataSource.transaction(async (manager) => {
      await manager.update(
        InvitationEntity,
        { id: invitation.id },
        { status: 'accepted' },
      );

      const existing = await manager.findOne(MembershipEntity, {
        where: { projectId: project.id, userId: user.id },
      });
      if (!existing) {
        await manager.save(
          manager.create(MembershipEntity, {
            projectId: project.id,
            userId: user.id,
            role: invitation.proposedRole,
          }),
        );
      }
    });

    await this.announceNewMember(project, user.id);
    await this.access.touch(project.id);
  }

  async rejectInvitation(
    user: UserEntity,
    invitationId: string,
  ): Promise<void> {
    const invitation = await this.ownInvitation(user, invitationId);
    await this.invitations.update(
      { id: invitation.id },
      { status: 'rejected' },
    );
  }

  /** Porteur et co-porteurs : ceux a qui une demande s'adresse. */
  private async leadersOf(projectId: string): Promise<string[]> {
    const rows = await this.memberships.find({
      where: [
        { projectId, role: 'owner' },
        { projectId, role: 'co_owner' },
      ],
    });
    return rows.filter((row) => !row.blocked).map((row) => row.userId);
  }

  private async announceNewMember(
    project: ProjectEntity,
    newMemberId: string,
  ): Promise<void> {
    const team = await this.memberships.find({
      where: { projectId: project.id, blocked: false },
    });
    await this.notifications.notifyMany(
      team.map((row) => row.userId).filter((id) => id !== newMemberId),
      {
        actorId: newMemberId,
        type: 'new_member',
        targetType: 'project',
        targetId: project.id,
      },
    );
  }

  private async leadJoinRequest(
    slug: string,
    actor: UserEntity,
    requestId: string,
  ): Promise<{ project: ProjectEntity; request: JoinRequestEntity }> {
    const project = await this.access.findBySlugOrFail(slug);
    await this.access.assertRole(project, actor, 'co_owner');

    const request = await this.joinRequests.findOne({
      where: { id: requestId, projectId: project.id },
    });
    if (!request) throw ApiError.notFound('Cette demande est introuvable.');
    if (request.status !== 'pending') {
      throw ApiError.conflict('Cette demande a deja ete traitee.');
    }

    return { project, request };
  }

  private async ownInvitation(
    user: UserEntity,
    invitationId: string,
  ): Promise<InvitationEntity> {
    const invitation = await this.invitations.findOne({
      where: { id: invitationId },
    });
    // Repondre 404 plutot que 403 : l'existence d'une invitation adressee a
    // quelqu'un d'autre n'a pas a etre confirmee.
    if (!invitation || invitation.recipientId !== user.id) {
      throw ApiError.notFound('Cette invitation est introuvable.');
    }
    if (invitation.status !== 'pending') {
      throw ApiError.conflict('Cette invitation a deja ete traitee.');
    }
    if (invitation.expiresAt.getTime() <= Date.now()) {
      throw ApiError.conflict('Cette invitation a expire.');
    }
    return invitation;
  }
}
