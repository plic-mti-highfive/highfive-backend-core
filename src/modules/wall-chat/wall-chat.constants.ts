import { createHash } from 'node:crypto';

/** File BullMQ alimentee par le service canvas (chat du Mur). */
export const CANVAS_EVENTS_QUEUE = 'canvas_events';
export const CANVAS_CHAT_JOB = 'canvas_chat_message';

/**
 * Auteur des reponses de l'assistant. Identifiant reserve, sans ligne
 * `users` : l'assistant n'est ni un compte ni un membre. `messages.author_id`
 * est `uuid NOT NULL` mais sans cle etrangere, donc il suffit a satisfaire la
 * colonne ; creer un vrai utilisateur le ferait apparaitre dans les
 * recherches, recommandations et statistiques.
 */
export const ASSISTANT_USER_ID = '00000000-0000-4000-8000-0000000000a1';
export const ASSISTANT_USERNAME = 'assistant-ia';
export const ASSISTANT_DISPLAY_NAME = 'Assistant IA';
/**
 * Identifiant de la reponse de l'assistant a un message : derive de l'id du
 * message, pour qu'un job rejoue retrouve (et re-diffuse) la reponse deja
 * sauvegardee au lieu d'en generer une seconde ou de n'en donner aucune.
 */
export const assistantReplyId = (messageId: string): string => {
  const h = createHash('sha1')
    .update(`assistant-reply:${messageId}`)
    .digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
};

/** Mot-cle qui adresse l'assistant dans le chat (mode `mention`). */
export const ASSISTANT_MENTION = /(^|[\s,;:(])@ia(?![\p{L}\p{N}_])/iu;
