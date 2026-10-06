import type {
  Announcement,
  Column as ColumnDto,
  Comment as CommentDto,
  Conversation,
  CurrentUser,
  Invitation,
  JoinRequest,
  Membership,
  Message,
  MessageAttachment,
  Need,
  Project,
  ProjectFile,
  Report,
  Tag,
  Task,
  User,
  UserSummary,
  Wall,
} from '../../contracts/index.js';
import type {
  AnnouncementEntity,
  ColumnEntity,
  CommentEntity,
  ConversationEntity,
  InvitationEntity,
  JoinRequestEntity,
  MembershipEntity,
  MessageEntity,
  NeedEntity,
  ProjectEntity,
  ProjectFileEntity,
  ReportEntity,
  TagEntity,
  TaskEntity,
  UserEntity,
  WallEntity,
} from '../../entities/index.js';

/**
 * Traduction entites -> contrat (`src/contracts/`).
 *
 * Un champ optionnel du contrat est rendu `undefined`, jamais `null` : les
 * schemas zod du front refusent `null` la ou ils acceptent l'absence, et
 * `JSON.stringify` retire les cles `undefined`. Une seule regle, appliquee
 * partout, plutot que des `.nullable()` disperses dans le contrat.
 */
const opt = <T>(value: T | null | undefined): T | undefined =>
  value === null ? undefined : value;

const iso = (date: Date): string => new Date(date).toISOString();

export const toTag = (tag: TagEntity): Tag => ({
  id: tag.id,
  label: tag.label,
  family: tag.family,
  accent: tag.accent,
});

export const toUserSummary = (user: UserEntity): UserSummary => ({
  id: user.id,
  username: user.username,
  displayName: opt(user.displayName),
  avatar: user.avatarUrl,
});

export const toUser = (user: UserEntity): User => ({
  ...toUserSummary(user),
  bio: opt(user.bio),
  interests: (user.interests ?? []).map((tag) => tag.id),
  createdAt: iso(user.createdAt),
});

export const toCurrentUser = (user: UserEntity): CurrentUser => ({
  ...toUser(user),
  email: user.email,
  accountStatus: user.accountStatus,
  platformRole: user.platformRole,
  lastVisitAt: iso(user.lastVisitAt),
});

export const toNeed = (need: NeedEntity): Need => ({
  id: need.id,
  label: need.label,
  tagId: opt(need.tagId),
  fulfilled: need.fulfilled,
});

/**
 * Un besoin pourvu reste visible barre pendant 7 jours (doc 04 §4), puis
 * disparait. Filtre a la lecture : aucune purge planifiee n'est necessaire.
 */
const VISIBLE_FULFILLED_MS = 7 * 24 * 60 * 60 * 1000;

export const visibleNeeds = (needs: NeedEntity[] | undefined): NeedEntity[] =>
  (needs ?? [])
    .filter(
      (need) =>
        !need.fulfilled ||
        !need.fulfilledAt ||
        Date.now() - need.fulfilledAt.getTime() < VISIBLE_FULFILLED_MS,
    )
    .sort((a, b) => a.label.localeCompare(b.label, 'fr'));

export const toProject = (project: ProjectEntity): Project => ({
  id: project.id,
  slug: project.slug,
  title: project.title,
  tagline: project.tagline,
  description: opt(project.description),
  tags: (project.tags ?? []).map((tag) => tag.id),
  needs: visibleNeeds(project.needs).map(toNeed),
  visibility: project.visibility,
  participation: project.participation,
  state: project.state,
  ownerId: project.ownerId,
  highfiveCount: project.highfiveCount,
  createdAt: iso(project.createdAt),
  updatedAt: iso(project.updatedAt),
  lastActivityAt: iso(project.lastActivityAt),
});

export const toMembership = (membership: MembershipEntity): Membership => ({
  projectId: membership.projectId,
  userId: membership.userId,
  role: membership.role,
  joinedAt: iso(membership.joinedAt),
  blocked: membership.blocked,
});

export const toJoinRequest = (request: JoinRequestEntity): JoinRequest => ({
  id: request.id,
  projectId: request.projectId,
  userId: request.userId,
  message: opt(request.message),
  status: request.status,
  createdAt: iso(request.createdAt),
});

export const toInvitation = (invitation: InvitationEntity): Invitation => ({
  id: invitation.id,
  projectId: invitation.projectId,
  senderId: invitation.senderId,
  recipientId: invitation.recipientId,
  proposedRole: invitation.proposedRole,
  message: opt(invitation.message),
  // R-I1 : une invitation echue est vue comme expiree sans attendre le
  // passage d'un travail planifie.
  status:
    invitation.status === 'pending' &&
    invitation.expiresAt.getTime() <= Date.now()
      ? 'expired'
      : invitation.status,
  expiresAt: iso(invitation.expiresAt),
  createdAt: iso(invitation.createdAt),
});

export const toAnnouncement = (
  announcement: AnnouncementEntity,
): Announcement => ({
  id: announcement.id,
  projectId: announcement.projectId,
  authorId: announcement.authorId,
  title: announcement.title,
  body: announcement.body,
  pinned: announcement.pinned,
  publishedAt: iso(announcement.publishedAt),
});

export const toComment = (comment: CommentEntity): CommentDto => ({
  id: comment.id,
  projectId: comment.projectId,
  authorId: comment.authorId,
  body: comment.body,
  parentId: opt(comment.parentId),
  publishedAt: iso(comment.publishedAt),
  hidden: comment.hidden,
});

export const toColumn = (column: ColumnEntity): ColumnDto => ({
  id: column.id,
  projectId: column.projectId,
  label: column.label,
  order: column.order,
  color: opt(column.color),
});

export const toTask = (task: TaskEntity): Task => ({
  id: task.id,
  columnId: task.columnId,
  title: task.title,
  details: opt(task.details),
  assigneeIds: (task.assignees ?? []).map((user) => user.id),
  dueDate: opt(task.dueDate),
  order: task.order,
  createdBy: task.createdBy,
  createdAt: iso(task.createdAt),
  wallOriginId: opt(task.wallOriginId),
});

export const toWall = (wall: WallEntity): Wall => ({
  projectId: wall.projectId,
  snapshotUrl: opt(wall.snapshotUrl),
  updatedAt: iso(wall.updatedAt),
});

export const toProjectFile = (file: ProjectFileEntity): ProjectFile => ({
  id: file.id,
  projectId: file.projectId,
  uploadedBy: file.uploadedBy,
  name: file.name,
  // `bigint` revient en chaine depuis le pilote Postgres.
  size: Number(file.size),
  mimeType: file.mimeType,
  uploadedAt: iso(file.uploadedAt),
});

export const toReport = (report: ReportEntity): Report => ({
  id: report.id,
  reporterId: report.reporterId,
  targetType: report.targetType,
  targetId: report.targetId,
  reason: report.reason,
  detail: opt(report.detail),
  status: report.status,
  handledBy: opt(report.handledBy),
  createdAt: iso(report.createdAt),
});

/**
 * Les participants ne sont pas une colonne : l'appelant les lit dans
 * `conversation_participants` et les passe ici.
 */
export const toConversation = (
  conversation: ConversationEntity,
  participantIds: string[],
): Conversation => ({
  id: conversation.id,
  type: conversation.type,
  participantIds,
  projectId: opt(conversation.projectId),
  title: opt(conversation.title),
  // R-MSG9 : un groupe sans administrateur enregistre (anterieur a la regle)
  // est administre par son plus ancien participant.
  adminId:
    conversation.type === 'group'
      ? (conversation.adminId ?? participantIds[0])
      : undefined,
  createdAt: iso(conversation.createdAt),
});

const toMessageAttachment = (
  message: MessageEntity,
): MessageAttachment | undefined => {
  if (message.attachmentKind === 'project' && message.attachmentProjectId) {
    return { kind: 'project', projectId: message.attachmentProjectId };
  }
  if (message.attachmentKind === 'file' && message.attachmentFileId) {
    return { kind: 'file', fileId: message.attachmentFileId };
  }
  if (message.attachmentKind === 'upload' && message.attachmentUploadId) {
    return { kind: 'upload', uploadId: message.attachmentUploadId };
  }
  return undefined;
};

/**
 * `readBy` est deduit des `last_read_at` des participants (SPEC.md §2) ;
 * l'appelant le calcule, ce mapper ne lit pas la base.
 */
export const toMessage = (
  message: MessageEntity,
  readBy: string[],
): Message => ({
  id: message.id,
  conversationId: message.conversationId,
  authorId: message.authorId,
  body: message.body,
  attachment: toMessageAttachment(message),
  readBy,
  sentAt: iso(message.sentAt),
  editedAt: message.editedAt ? iso(message.editedAt) : undefined,
  deleted: message.deleted,
});
