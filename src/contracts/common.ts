import { z } from 'zod';

/**
 * Primitives partagees par tous les schemas de domaine.
 *
 * Identifiants publics : `slug` pour un projet, `username` pour une personne
 * (R-X4, R-R2). Les `id` internes (uuid) ne s'affichent jamais a l'utilisateur.
 */
export const idSchema = z.uuid();
export const isoDateTimeSchema = z.iso.datetime();

/** Slug d'URL : minuscules, chiffres, tirets. Utilise pour les projets et les tags. */
export const slugSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug invalide');

/**
 * Corps d'erreur renvoye par `apiFetch` (client.ts) et par tous les handlers
 * MSW en cas d'echec. Une seule forme d'erreur pour toute l'API (V2-11).
 */
export const apiErrorBodySchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});
export type ApiErrorBody = z.infer<typeof apiErrorBodySchema>;

/**
 * Page de resultats generique. `nextCursor` vaut `null` quand il n'y a plus
 * de page suivante ; `total` est toujours calcule cote serveur (R-X2).
 */
export function paginatedSchema<Item extends z.ZodType>(itemSchema: Item) {
  return z.object({
    items: z.array(itemSchema),
    nextCursor: z.string().nullable(),
    total: z.number().int().nonnegative(),
  });
}
export type Paginated<T> = {
  items: T[];
  nextCursor: string | null;
  total: number;
};

/** Parametres de pagination par curseur, communs a toutes les listes. */
export const cursorPaginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).optional(),
});
export type CursorPagination = z.infer<typeof cursorPaginationSchema>;
