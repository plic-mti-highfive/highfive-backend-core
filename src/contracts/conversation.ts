import { z } from 'zod';
import { idSchema, isoDateTimeSchema, slugSchema } from './common.js';
import { userSummarySchema } from './user.js';

/**
 * Messagerie (doc 04 section 13). `direct` : exactement 2 participants
 * (R-MSG1). `group` : 3 a 50 (R-MSG2). `channel` : miroir de l'equipe d'un
 * projet, non gere manuellement (R-MSG3) — projectId obligatoire alors, et
 * pas de plafond : un canal compte autant de personnes que l'equipe.
 */
export const GROUP_MAX_PARTICIPANTS = 50;

export const conversationTypeSchema = z.enum(['direct', 'group', 'channel']);
export type ConversationType = z.infer<typeof conversationTypeSchema>;

const conversationBase = z.object({
  id: idSchema,
  type: conversationTypeSchema,
  participantIds: z.array(idSchema).min(2),
  projectId: idSchema.optional(),
  title: z.string().min(1).max(80).optional(),
  /**
   * R-MSG9 : administrateur d'un groupe (son createur, puis le plus ancien
   * participant s'il s'en va). Absent pour une conversation directe ou un
   * canal, qui ne se gerent pas ainsi.
   */
  adminId: idSchema.optional(),
  createdAt: isoDateTimeSchema,
});

export const conversationSchema = conversationBase.superRefine(
  (conversation, ctx) => {
    if (
      conversation.type === 'direct' &&
      conversation.participantIds.length !== 2
    ) {
      ctx.addIssue({
        code: 'custom',
        message:
          'R-MSG1 : une conversation directe compte exactement 2 personnes',
        path: ['participantIds'],
      });
    }
    if (
      conversation.type === 'group' &&
      conversation.participantIds.length > GROUP_MAX_PARTICIPANTS
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'R-MSG2 : un groupe compte au plus 50 personnes',
        path: ['participantIds'],
      });
    }
    if (conversation.type === 'channel' && !conversation.projectId) {
      ctx.addIssue({
        code: 'custom',
        message: 'R-MSG3 : un canal est rattache a un projet',
        path: ['projectId'],
      });
    }
  },
);
export type Conversation = z.infer<typeof conversationSchema>;

/**
 * R-MSG4 : un message peut embarquer un projet, un fichier deja depose dans
 * un projet, ou un depot propre a la conversation (`upload` : image, video ou
 * fichier — R-MSG8).
 */
export const messageAttachmentKindSchema = z.enum([
  'project',
  'file',
  'upload',
]);
export type MessageAttachmentKind = z.infer<typeof messageAttachmentKindSchema>;

/** Version pour la liste des conversations (`/api/conversations`). */
export const conversationSummarySchema = conversationBase.extend({
  /** Personnes de la conversation, resolues (avatar/pseudo) pour l'affichage. */
  participants: z.array(userSummarySchema),
  /** R-MSG3 : nom/slug du projet, resolus quand `type === "channel"`. */
  projectSlug: slugSchema.optional(),
  projectTitle: z.string().optional(),
  lastMessage: z
    .object({
      body: z.string(),
      authorId: idSchema,
      sentAt: isoDateTimeSchema,
      /** R-MSG6 : le corps est vide quand le dernier message a ete supprime. */
      deleted: z.boolean().default(false),
      /**
       * R-MSG8 : le corps peut etre vide quand le message porte une piece
       * jointe — l'apercu de la liste affiche alors son type.
       */
      attachmentKind: messageAttachmentKindSchema.optional(),
    })
    .optional(),
  unreadCount: z.number().int().nonnegative(),
  isMessageRequest: z.boolean().default(false),
});
export type ConversationSummary = z.infer<typeof conversationSummarySchema>;

/** Version detaillee pour l'ouverture d'une conversation (`/api/conversations/:id`). */
export const conversationDetailSchema = conversationBase.extend({
  participants: z.array(userSummarySchema),
  projectSlug: slugSchema.optional(),
  projectTitle: z.string().optional(),
});
export type ConversationDetail = z.infer<typeof conversationDetailSchema>;

/** R-MSG4 : la piece jointe d'un message, par reference (voir `messageAttachmentKindSchema`). */
export const messageAttachmentSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('project'), projectId: idSchema }),
  z.object({ kind: z.literal('file'), fileId: idSchema }),
  /** R-MSG8 : `uploadId` vient de `POST /conversations/:id/attachments`. */
  z.object({ kind: z.literal('upload'), uploadId: idSchema }),
]);
export type MessageAttachment = z.infer<typeof messageAttachmentSchema>;

export const messageSchema = z.object({
  id: idSchema,
  conversationId: idSchema,
  authorId: idSchema,
  body: z.string().max(4000),
  attachment: messageAttachmentSchema.optional(),
  readBy: z.array(idSchema).default([]),
  sentAt: isoDateTimeSchema,
  editedAt: isoDateTimeSchema.optional(),
  deleted: z.boolean().default(false),
});
export type Message = z.infer<typeof messageSchema>;

/** R-MSG4 : aperçu résolu d'une pièce jointe, pour l'affichage embarqué dans la bulle. */
export const messageAttachmentPreviewSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('project'),
    projectSlug: slugSchema,
    projectTitle: z.string(),
    projectTagline: z.string(),
  }),
  z.object({
    kind: z.literal('file'),
    fileId: idSchema,
    fileName: z.string(),
    fileSize: z.number().int().nonnegative(),
  }),
  /**
   * R-MSG8 : `mimeType` (le type reel, verifie a la reception) decide de
   * l'affichage — image, lecteur video ou lien de telechargement. `url` est
   * signee et de courte duree : elle se relit avec le message, jamais ne se
   * conserve.
   */
  z.object({
    kind: z.literal('upload'),
    uploadId: idSchema,
    fileName: z.string(),
    fileSize: z.number().int().nonnegative(),
    mimeType: z.string(),
    url: z.url(),
  }),
]);
export type MessageAttachmentPreview = z.infer<
  typeof messageAttachmentPreviewSchema
>;

/** Message enrichi de son auteur et de l'aperçu resolu de sa piece jointe. */
export const messageWithAuthorSchema = messageSchema.extend({
  author: userSummarySchema,
  attachmentPreview: messageAttachmentPreviewSchema.optional(),
});
export type MessageWithAuthor = z.infer<typeof messageWithAuthorSchema>;

/** R-MSG8 : le texte devient facultatif des qu'une piece jointe l'accompagne. */
export const messageCreateInputSchema = z
  .object({
    body: z.string().max(4000).optional(),
    attachment: messageAttachmentSchema.optional(),
  })
  .refine((input) => !!input.body || input.attachment !== undefined, {
    message: "Un message sans piece jointe a besoin d'un texte.",
    path: ['body'],
  });
export type MessageCreateInput = z.infer<typeof messageCreateInputSchema>;

/** Corps de `PATCH /messages/:id` (R-MSG5) : on corrige un texte, on ne le vide pas. */
export const messageBodyUpdateInputSchema = z.object({
  body: z.string().min(1).max(4000),
});
export type MessageBodyUpdateInput = z.infer<
  typeof messageBodyUpdateInputSchema
>;

/**
 * R-MSG8 : reponse de `POST /conversations/:id/attachments` (multipart,
 * champ `file`). Le depot reste prive a son auteur jusqu'a ce qu'un message
 * le reference ; non rattache, il est purge apres 24 h.
 */
export const messageUploadSchema = z.object({
  id: idSchema,
  fileName: z.string(),
  fileSize: z.number().int().nonnegative(),
  mimeType: z.string(),
});
export type MessageUpload = z.infer<typeof messageUploadSchema>;

export const conversationCreateInputSchema = z.object({
  participantIds: z
    .array(idSchema)
    .min(1)
    .max(GROUP_MAX_PARTICIPANTS - 1),
  title: z.string().min(1).max(80).optional(),
  message: z.string().min(1).max(4000),
});
export type ConversationCreateInput = z.infer<
  typeof conversationCreateInputSchema
>;

/**
 * R-MSG9 : `PATCH /conversations/:id` — renommer un groupe (tout
 * participant). Une conversation directe ne se nomme pas (R-MSG1), un canal
 * porte le nom de son projet (R-MSG3).
 */
export const conversationUpdateInputSchema = z.object({
  title: z.string().min(1).max(80),
});
export type ConversationUpdateInput = z.infer<
  typeof conversationUpdateInputSchema
>;

/**
 * R-MSG9 : `POST /conversations/:id/participants` — ajouter des personnes a
 * un groupe (tout participant), dans la limite de R-MSG2.
 */
export const conversationParticipantsAddInputSchema = z.object({
  participantIds: z
    .array(idSchema)
    .min(1)
    .max(GROUP_MAX_PARTICIPANTS - 1),
});
export type ConversationParticipantsAddInput = z.infer<
  typeof conversationParticipantsAddInputSchema
>;
