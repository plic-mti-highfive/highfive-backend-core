import { z } from 'zod';
import { idSchema, isoDateTimeSchema } from './common.js';

/**
 * Fichier (doc 04 section 12). Ecart vs la liste de fichiers de domaine
 * demandee explicitement : ajoute car `src/api/files.ts` (upload) a besoin
 * d'un contrat de sortie, et Les Fichiers sont un objet de domaine a part
 * entiere. R-F1 : 20 Mo par fichier, 200 Mo par projet (verifie cote handler).
 *
 * Nomme `ProjectFile` (et non `File`) pour ne pas masquer le type DOM natif
 * utilise par les composants d'upload.
 */
export const projectFileSchema = z.object({
  id: idSchema,
  projectId: idSchema,
  uploadedBy: idSchema,
  name: z.string().min(1).max(255),
  size: z.number().int().nonnegative(),
  mimeType: z.string().min(1),
  uploadedAt: isoDateTimeSchema,
});
export type ProjectFile = z.infer<typeof projectFileSchema>;
