/** File BullMQ alimentee par le service canvas (chat du Mur). */
export const CANVAS_EVENTS_QUEUE = 'canvas_events';
export const CANVAS_CHAT_JOB = 'canvas_chat_message';

/**
 * Auteur des reponses de l'assistant. Identifiant reserve, sans ligne
 * `users` : l'assistant n'est ni un compte ni un membre.
 */
export const ASSISTANT_USER_ID = '00000000-0000-4000-8000-0000000000a1';
export const ASSISTANT_USERNAME = 'assistant-ia';
export const ASSISTANT_DISPLAY_NAME = 'Assistant IA';
/** Mot-cle qui adresse l'assistant dans le chat (mode `mention`). */
export const ASSISTANT_MENTION = /(^|[\s,;:(])@ia(?![\p{L}\p{N}_])/iu;
