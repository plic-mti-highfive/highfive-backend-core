import { describe, expect, it } from 'vitest';
import {
  conversationSchema,
  messageSchema,
  projectSchema,
  taskSchema,
  userSchema,
} from '../../contracts/index.js';
import type {
  ConversationEntity,
  MessageEntity,
  NeedEntity,
  ProjectEntity,
  TaskEntity,
  UserEntity,
} from '../../entities/index.js';
import {
  toConversation,
  toMessage,
  toProject,
  toTask,
  toUser,
  visibleNeeds,
} from './index.js';

const now = new Date('2026-01-15T10:00:00.000Z');

const user = (overrides: Partial<UserEntity> = {}): UserEntity => ({
  id: '11111111-1111-4111-8111-111111111111',
  username: 'alex.rivera',
  displayName: null,
  email: 'alex@example.com',
  avatarUrl: 'https://example.com/a.svg',
  bio: null,
  accountStatus: 'active',
  platformRole: 'member',
  passwordHash: 'hash',
  interests: [],
  createdAt: now,
  lastVisitAt: now,
  deletedAt: null,
  ...overrides,
});

describe('null jamais renvoye', () => {
  /*
   * Les schemas zod du front acceptent l'absence d'un champ optionnel, pas sa
   * valeur nulle : un `null` echappe casserait la validation cote client.
   */
  it('rend un champ nullable en base comme absent', () => {
    const parsed = userSchema.parse(toUser(user()));
    expect(parsed.bio).toBeUndefined();
    expect(parsed.displayName).toBeUndefined();
  });

  it('conserve les valeurs presentes', () => {
    const parsed = userSchema.parse(
      toUser(user({ bio: 'Fresques et murs', displayName: 'Alex' })),
    );
    expect(parsed.bio).toBe('Fresques et murs');
    expect(parsed.displayName).toBe('Alex');
  });
});

describe('toProject', () => {
  const project = (): ProjectEntity =>
    ({
      id: '22222222-2222-4222-8222-222222222222',
      slug: 'fresque-murale',
      ownerId: user().id,
      title: 'Fresque murale',
      tagline: 'Repeindre le mur du gymnase',
      description: null,
      tags: [{ id: 'dessin' }, { id: 'quartier' }],
      needs: [],
      visibility: 'public',
      participation: 'open',
      state: 'active',
      highfiveCount: 12,
      createdAt: now,
      updatedAt: now,
      lastActivityAt: now,
      deletedAt: null,
    }) as unknown as ProjectEntity;

  it('respecte le contrat', () => {
    expect(() => projectSchema.parse(toProject(project()))).not.toThrow();
  });

  it('projette les themes sur leurs identifiants', () => {
    expect(toProject(project()).tags).toEqual(['dessin', 'quartier']);
  });

  it('rend les dates en ISO avec suffixe Z', () => {
    expect(toProject(project()).createdAt).toBe('2026-01-15T10:00:00.000Z');
  });
});

describe('visibleNeeds', () => {
  const need = (overrides: Partial<NeedEntity>): NeedEntity =>
    ({
      id: '33333333-3333-4333-8333-333333333333',
      projectId: 'p',
      label: 'Peintres',
      tagId: null,
      fulfilled: false,
      fulfilledAt: null,
      ...overrides,
    }) as NeedEntity;

  it('garde les besoins non pourvus', () => {
    expect(visibleNeeds([need({})])).toHaveLength(1);
  });

  it('garde un besoin pourvu recemment, barre pendant sept jours', () => {
    expect(
      visibleNeeds([need({ fulfilled: true, fulfilledAt: new Date() })]),
    ).toHaveLength(1);
  });

  it('retire un besoin pourvu depuis plus de sept jours', () => {
    const old = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    expect(
      visibleNeeds([need({ fulfilled: true, fulfilledAt: old })]),
    ).toHaveLength(0);
  });
});

describe('toTask', () => {
  it('projette les assignes sur leurs identifiants et respecte le contrat', () => {
    const task = {
      id: '44444444-4444-4444-8444-444444444444',
      columnId: '55555555-5555-4555-8555-555555555555',
      title: 'Acheter la peinture',
      details: null,
      assignees: [user()],
      dueDate: null,
      order: 0,
      createdBy: user().id,
      createdAt: now,
      wallOriginId: 'shape:abc',
    } as unknown as TaskEntity;

    const mapped = toTask(task);
    expect(() => taskSchema.parse(mapped)).not.toThrow();
    expect(mapped.assigneeIds).toEqual([user().id]);
    expect(mapped.dueDate).toBeUndefined();
    expect(mapped.wallOriginId).toBe('shape:abc');
  });
});

describe('toConversation', () => {
  const other = '66666666-6666-4666-8666-666666666666';
  const conversation = (
    overrides: Partial<ConversationEntity> = {},
  ): ConversationEntity => ({
    id: '77777777-7777-4777-8777-777777777777',
    type: 'direct',
    kind: 'messaging',
    projectId: null,
    title: null,
    adminId: null,
    directKey: `${user().id}:${other}`,
    createdAt: now,
    lastActivityAt: now,
    ...overrides,
  });

  it('respecte le contrat et ne divulgue ni cle directe ni cache de tri', () => {
    const mapped = toConversation(conversation(), [user().id, other]);
    expect(() => conversationSchema.parse(mapped)).not.toThrow();
    expect(mapped.projectId).toBeUndefined();
    expect(mapped.title).toBeUndefined();
    expect(mapped).not.toHaveProperty('directKey');
    expect(mapped).not.toHaveProperty('lastActivityAt');
  });

  it('R-MSG9 : un groupe a toujours un administrateur', () => {
    const third = '99999999-9999-4999-8999-999999999999';
    const ids = [user().id, other, third];
    expect(
      toConversation(conversation({ type: 'group', directKey: null }), ids)
        .adminId,
    ).toBe(user().id);
    expect(
      toConversation(
        conversation({ type: 'group', directKey: null, adminId: third }),
        ids,
      ).adminId,
    ).toBe(third);
    expect(
      toConversation(conversation(), [user().id, other]).adminId,
    ).toBeUndefined();
  });

  it("rend le projet d'un canal (R-MSG3)", () => {
    const projectId = '88888888-8888-4888-8888-888888888888';
    const mapped = toConversation(
      conversation({ type: 'channel', projectId, directKey: null }),
      [user().id, other],
    );
    expect(conversationSchema.parse(mapped).projectId).toBe(projectId);
  });
});

describe('toMessage', () => {
  const message = (overrides: Partial<MessageEntity> = {}): MessageEntity => ({
    id: '99999999-9999-4999-8999-999999999999',
    conversationId: '77777777-7777-4777-8777-777777777777',
    authorId: user().id,
    body: 'Salut !',
    attachmentKind: null,
    attachmentProjectId: null,
    attachmentFileId: null,
    attachmentUploadId: null,
    sentAt: now,
    editedAt: null,
    deleted: false,
    ...overrides,
  });

  it('respecte le contrat sans piece jointe ni modification', () => {
    const mapped = toMessage(message(), [user().id]);
    expect(() => messageSchema.parse(mapped)).not.toThrow();
    expect(mapped.attachment).toBeUndefined();
    expect(mapped.editedAt).toBeUndefined();
    expect(mapped.readBy).toEqual([user().id]);
  });

  it('recompose la piece jointe a plat en union discriminee (R-MSG4)', () => {
    const projectId = '88888888-8888-4888-8888-888888888888';
    const fileId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

    expect(
      toMessage(
        message({ attachmentKind: 'project', attachmentProjectId: projectId }),
        [],
      ).attachment,
    ).toEqual({ kind: 'project', projectId });
    expect(
      toMessage(
        message({ attachmentKind: 'file', attachmentFileId: fileId }),
        [],
      ).attachment,
    ).toEqual({ kind: 'file', fileId });
    expect(
      toMessage(
        message({ attachmentKind: 'upload', attachmentUploadId: fileId }),
        [],
      ).attachment,
    ).toEqual({ kind: 'upload', uploadId: fileId });
  });

  it('rend la date de modification en ISO', () => {
    const editedAt = new Date('2026-01-15T10:05:00.000Z');
    const mapped = messageSchema.parse(toMessage(message({ editedAt }), []));
    expect(mapped.editedAt).toBe(editedAt.toISOString());
  });
});
