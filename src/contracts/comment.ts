import { z } from 'zod';
import { idSchema, isoDateTimeSchema } from './common.js';

/**
 * Commentaire (doc 04 section 9). R-C4 : un seul niveau de reponse, pas
 * d'arborescence — `parentId` ne peut pointer qu'un commentaire racine,
 * verifie cote handler.
 */
export const commentSchema = z.object({
  id: idSchema,
  projectId: idSchema,
  authorId: idSchema,
  body: z.string().min(1).max(1000),
  parentId: idSchema.optional(),
  publishedAt: isoDateTimeSchema,
  hidden: z.boolean().default(false),
});
export type Comment = z.infer<typeof commentSchema>;

export const commentCreateInputSchema = z.object({
  body: z.string().min(1).max(1000),
  parentId: idSchema.optional(),
});
export type CommentCreateInput = z.infer<typeof commentCreateInputSchema>;
