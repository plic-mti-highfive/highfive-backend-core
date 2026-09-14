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
  elementIds: z.array(z.string()).min(1),
});
export type WallToTasksInput = z.infer<typeof wallToTasksInputSchema>;
