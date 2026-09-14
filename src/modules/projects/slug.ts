/**
 * Slug d'un projet (R-X4) : derive du titre a la creation, puis stable —
 * changer le titre ne change pas l'adresse, sans quoi tout lien partage
 * casserait.
 */
export function slugify(title: string): string {
  const base = title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 70);

  // Un titre entierement non latin (« 日本語 ») donnerait un slug vide.
  return base || 'projet';
}
