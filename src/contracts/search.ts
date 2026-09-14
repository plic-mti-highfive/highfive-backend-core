import { z } from 'zod';
import { paginatedSchema } from './common.js';
import { projectSummarySchema } from './project.js';
import { tagSchema } from './tag.js';
import { userSummarySchema } from './user.js';

/**
 * Parametres de recherche (doc 06 R-R4) : vivent dans la chaine de requete
 * `/recherche?q=...&type=...&tags=...&tri=...`. Remplace les `unknown` de
 * l'ancien `GlobalSearchResponse` (tags/progress) par des schemas typés.
 */
export const searchEntityTypeSchema = z.enum(['projects', 'users', 'tags']);
export type SearchEntityType = z.infer<typeof searchEntityTypeSchema>;

/**
 * `active` ajoute (additif) pour porter le tri "Les plus actifs" du doc 12
 * (E-02) : distinct de `relevant` (pertinence texte) et de `recent`
 * (creation), il trie par `lastActivityAt`.
 */
export const searchSortSchema = z.enum([
  'recent',
  'popular',
  'relevant',
  'active',
]);
export type SearchSort = z.infer<typeof searchSortSchema>;

export const searchParamsSchema = z.object({
  q: z.string().max(200).optional(),
  types: z.array(searchEntityTypeSchema).optional(),
  tags: z.array(z.string()).optional(),
  sort: searchSortSchema.optional(),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).optional(),
});
export type SearchParams = z.infer<typeof searchParamsSchema>;

export const searchResultsSchema = z.object({
  projects: paginatedSchema(projectSummarySchema).optional(),
  users: paginatedSchema(userSummarySchema).optional(),
  tags: paginatedSchema(tagSchema).optional(),
});
export type SearchResults = z.infer<typeof searchResultsSchema>;

/** Colonne d'appui "Ce qui bouge en ce moment" (doc 12 E-01). */
export const trendingTagSchema = z.object({
  tag: tagSchema,
  projectsCount: z.number().int().nonnegative(),
});
export type TrendingTag = z.infer<typeof trendingTagSchema>;

/**
 * Sections du fil Decouvrir (doc 12 E-01, retour utilisateur "Decouvrir
 * connecte trop pauvre" — v2). Chaque section porte sa propre regle de
 * selection cote serveur (handler MSW) et son lien "Voir plus" vers
 * `/recherche`. Le libelle affiche vit cote front (`Record<DiscoverSectionId,
 * string>`), jamais renvoye par l'API — cf. Section de `shared/ui`.
 * `for_you`/`near_your_projects` sont personnalisees et absentes du tableau
 * quand elles seraient vides (visiteur, ou compte sans intéret/projet).
 */
export const discoverSectionIdSchema = z.enum([
  'for_you',
  'starting',
  'trending_highfives',
  'needs_help',
  'near_your_projects',
]);
export type DiscoverSectionId = z.infer<typeof discoverSectionIdSchema>;

export const discoverSectionSchema = z.object({
  id: discoverSectionIdSchema,
  items: z.array(projectSummarySchema),
  /** Parametres a reappliquer sur `/recherche` pour le lien "Voir plus". */
  seeAll: searchParamsSchema,
});
export type DiscoverSection = z.infer<typeof discoverSectionSchema>;

/** Fil Decouvrir (`/feed/discover`) : "projet du moment" hors section, puis sections non vides. */
export const discoverFeedSchema = z.object({
  moment: projectSummarySchema.nullable(),
  sections: z.array(discoverSectionSchema),
});
export type DiscoverFeed = z.infer<typeof discoverFeedSchema>;
