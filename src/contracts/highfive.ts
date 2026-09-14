import { z } from 'zod';
import { idSchema, isoDateTimeSchema } from './common.js';

/**
 * Highfive (doc 04 section 8). R-H1 : un par personne et par projet,
 * reversible. R-H2 : le porteur ne peut pas highfiver son propre projet —
 * verifie cote handler (403), pas dans ce schema.
 */
export const highfiveSchema = z.object({
  projectId: idSchema,
  userId: idSchema,
  givenAt: isoDateTimeSchema,
});
export type Highfive = z.infer<typeof highfiveSchema>;
