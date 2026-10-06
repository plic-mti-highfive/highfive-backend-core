import type { MessageEntity } from '../../entities/index.js';

/** `ReportTargetPreview.excerpt` est borne a 1000 caracteres, un message a 4000. */
const EXCERPT_MAX = 1000;

/**
 * Ce que la moderation lit d'un message signale. Un message sans texte
 * (R-MSG8) s'annonce par sa piece jointe plutot que par un extrait vide, qui
 * laisserait croire a un signalement sans objet.
 */
export function messageExcerpt(
  message: Pick<MessageEntity, 'body' | 'deleted' | 'attachmentKind'>,
  uploadName?: string,
): string {
  if (message.deleted) return 'Message supprime par son auteur.';
  if (message.body) {
    return message.body.length > EXCERPT_MAX
      ? `${message.body.slice(0, EXCERPT_MAX - 1)}…`
      : message.body;
  }
  switch (message.attachmentKind) {
    case 'upload':
      return `[Fichier joint : ${uploadName ?? 'introuvable'}]`;
    case 'project':
      return '[Projet joint]';
    case 'file':
      return '[Fichier de projet joint]';
    default:
      return '';
  }
}
