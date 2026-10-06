/**
 * Contrat de donnees partage avec le front (V2-4/V2-6, SPEC.md §1.7).
 *
 * Ces fichiers sont la copie conforme de `src/domain/**` du depot
 * `highfive-frontend` : ce sont les memes schemas zod qui valident les corps
 * cote client (MSW) et cote serveur, de sorte que `openapi.yaml` — genere
 * depuis ces schemas — ne puisse pas deriver du code qui valide reellement.
 * Ils remplacent l'ancien paquet `@plic-mti-highfive/shared-types`, supprime.
 *
 * Regle : ne jamais modifier un schema ici sans le modifier d'abord cote
 * front.
 */

export * from './common.js';
export * from './tag.js';
export * from './user.js';
export * from './project.js';
export * from './membership.js';
export * from './highfive.js';
export * from './announcement.js';
export * from './comment.js';
export * from './task.js';
export * from './wall.js';
export * from './file.js';
export * from './notification.js';
export * from './conversation.js';
export * from './search.js';
export * from './auth.js';
export * from './admin.js';
