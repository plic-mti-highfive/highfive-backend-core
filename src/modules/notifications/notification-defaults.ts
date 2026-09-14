import {
  notificationTypeSchema,
  type NotificationChannel,
  type NotificationPreference,
  type NotificationType,
} from '../../contracts/index.js';

export const NOTIFICATION_TYPES: NotificationType[] =
  notificationTypeSchema.options;

/**
 * R-N4 : tout arrive dans l'application ; seuls trois types partent aussi par
 * courriel par defaut — ceux qui appellent une reponse de la personne et qu'on
 * ne peut pas rater sans consequence.
 */
const EMAIL_BY_DEFAULT = new Set<NotificationType>([
  'invitation_received',
  'join_request_received',
  'message_received',
]);

export const defaultChannelsFor = (
  type: NotificationType,
): NotificationChannel[] =>
  EMAIL_BY_DEFAULT.has(type) ? ['app', 'email'] : ['app'];

export const defaultPreferences = (): NotificationPreference[] =>
  NOTIFICATION_TYPES.map((type) => ({
    type,
    channels: defaultChannelsFor(type),
  }));
