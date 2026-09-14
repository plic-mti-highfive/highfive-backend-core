import { z } from 'zod';
import { idSchema, isoDateTimeSchema, slugSchema } from './common.js';
import { userSummarySchema } from './user.js';

/** R-N1 : types de notification enumeres par le doc 04 section 14. */
export const notificationTypeSchema = z.enum([
  'highfive_received',
  'comment_on_project',
  'reply_to_comment',
  'join_request_received',
  'join_request_accepted',
  'join_request_rejected',
  'invitation_received',
  'new_member',
  'announcement_on_followed_project',
  'task_assigned',
  'mention',
  'message_received',
  'admin_decision',
]);
export type NotificationType = z.infer<typeof notificationTypeSchema>;

export const notificationTargetTypeSchema = z.enum([
  'project',
  'task',
  'message',
  'comment',
]);
export type NotificationTargetType = z.infer<
  typeof notificationTargetTypeSchema
>;

/**
 * Notification (doc 04 section 14). R-N2 : regroupement obligatoire — un
 * meme evenement sur une meme cible agrege ses acteurs dans `actorIds`
 * ("Sophie et 4 autres ont highfive Fresque murale") plutot que de creer une
 * notification par acteur.
 */
export const notificationSchema = z.object({
  id: idSchema,
  recipientId: idSchema,
  type: notificationTypeSchema,
  actorIds: z.array(idSchema).min(1),
  targetType: notificationTargetTypeSchema,
  targetId: idSchema,
  read: z.boolean().default(false),
  createdAt: isoDateTimeSchema,
});
export type Notification = z.infer<typeof notificationSchema>;

/**
 * Cible resolue d'une notification, pour un routage exact vers une route FR
 * (R-N3) : `/projets/:slug` (project/comment), `/projets/:slug/lab/taches`
 * (task) ou `/messages/:id` (message).
 */
export const notificationTargetSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('project'),
    projectSlug: slugSchema,
    projectTitle: z.string(),
  }),
  z.object({
    type: z.literal('task'),
    projectSlug: slugSchema,
    projectTitle: z.string(),
    taskTitle: z.string(),
  }),
  z.object({
    type: z.literal('comment'),
    projectSlug: slugSchema,
    projectTitle: z.string(),
  }),
  z.object({
    type: z.literal('message'),
    conversationId: idSchema,
    /** Nom affichable de la conversation (canal/groupe) quand il en a un. */
    conversationTitle: z.string().optional(),
  }),
]);
export type NotificationTarget = z.infer<typeof notificationTargetSchema>;

/**
 * Version enrichie pour la liste (`/api/notifications`). R-N2 : `actorIds`
 * est deja regroupe cote serveur, `actors` en donne la projection affichable
 * ("Sophie et 4 autres..."). R-N3 : `target` porte de quoi construire le lien
 * exact sans requete supplementaire.
 */
export const notificationSummarySchema = notificationSchema.extend({
  actors: z.array(userSummarySchema).min(1),
  target: notificationTargetSchema,
});
export type NotificationSummary = z.infer<typeof notificationSummarySchema>;

/** R-N4 : preferences par type et par canal, reglables dans /reglages/notifications. */
export const notificationChannelSchema = z.enum(['app', 'email']);
export type NotificationChannel = z.infer<typeof notificationChannelSchema>;

export const notificationPreferenceSchema = z.object({
  type: notificationTypeSchema,
  channels: z.array(notificationChannelSchema),
});
export type NotificationPreference = z.infer<
  typeof notificationPreferenceSchema
>;

export const notificationPreferencesUpdateInputSchema = z.array(
  notificationPreferenceSchema,
);
export type NotificationPreferencesUpdateInput = z.infer<
  typeof notificationPreferencesUpdateInputSchema
>;
