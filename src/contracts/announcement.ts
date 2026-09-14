import { z } from 'zod';
import { idSchema, isoDateTimeSchema } from './common.js';

/**
 * Annonce (doc 04 section 9). R-A1 : porteur et co-porteur seulement.
 * R-A2 : une seule annonce epinglee a la fois par projet — verifie cote
 * handler, pas dans ce schema unitaire.
 */
export const announcementSchema = z.object({
  id: idSchema,
  projectId: idSchema,
  authorId: idSchema,
  title: z.string().min(3).max(80),
  body: z.string().max(2000),
  pinned: z.boolean().default(false),
  publishedAt: isoDateTimeSchema,
});
export type Announcement = z.infer<typeof announcementSchema>;

export const announcementCreateInputSchema = z.object({
  title: z.string().min(3).max(80),
  body: z.string().max(2000),
  pinned: z.boolean().optional(),
});
export type AnnouncementCreateInput = z.infer<
  typeof announcementCreateInputSchema
>;
