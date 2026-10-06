import { z } from 'zod';
import { idSchema, isoDateTimeSchema } from './common.js';

/**
 * Metadonnees du Mur (doc 04 section 10). Le document collaboratif
 * lui-meme (tldraw / Yjs) ne passe pas par ce contrat REST : il vit dans le
 * provider Hocuspocus. Ce schema ne couvre que ce que l'API expose autour.
 */
export const wallSchema = z.object({
  projectId: idSchema,
  snapshotUrl: z.url().optional(),
  updatedAt: isoDateTimeSchema,
});
export type Wall = z.infer<typeof wallSchema>;

/** R-W2 : conversion d'elements du Mur en taches (colonne "A faire"). */
export const wallToTasksInputSchema = z.object({
  elements: z.array(z.object({ id: z.string(), label: z.string() })).min(1),
});
export type WallToTasksInput = z.infer<typeof wallToTasksInputSchema>;

/** Roles du document collaboratif (le viewer se connecte en lecture seule). */
export const wallRoleSchema = z.enum(['admin', 'editor', 'viewer']);
export type WallRole = z.infer<typeof wallRoleSchema>;

/**
 * Session d'acces au document collaboratif : `websocketUrl` + `token` (JWT
 * court emis par le core) servent a ouvrir le provider Hocuspocus sur le
 * document nomme `canvasId`.
 */
export const wallSessionSchema = z.object({
  canvasId: z.string().min(1),
  projectId: idSchema,
  websocketUrl: z.string().min(1),
  token: z.string().min(1),
  role: wallRoleSchema,
});
export type WallSession = z.infer<typeof wallSessionSchema>;

/** Tache proposee par l'IA a partir du Mur ; rien n'est persiste avant acceptation. */
export const proposedTaskSchema = z.object({
  title: z.string().min(1).max(120),
  description: z.string().max(1000).default(''),
  /** Elements du Mur qui ont motive la tache (indice pour juger). */
  sourceHints: z.array(z.string()).default([]),
});
export type ProposedTask = z.infer<typeof proposedTaskSchema>;

/** Reponse de `POST /projects/:slug/wall/suggest-tasks`. */
export const wallSuggestionsSchema = z.object({
  tasks: z.array(proposedTaskSchema),
  /** Vrai quand le Mur ne contient pas assez de matiere pour proposer quoi que ce soit. */
  empty: z.boolean(),
});
export type WallSuggestions = z.infer<typeof wallSuggestionsSchema>;

/** Corps de `POST /projects/:slug/wall/suggested-tasks` : propositions retenues. */
export const acceptSuggestedTasksInputSchema = z.object({
  tasks: z.array(proposedTaskSchema).min(1).max(50),
});
export type AcceptSuggestedTasksInput = z.infer<
  typeof acceptSuggestedTasksInputSchema
>;
