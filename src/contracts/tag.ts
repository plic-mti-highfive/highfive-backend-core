import { z } from 'zod';

/**
 * Tag (doc 04 section 7) : liste fermee de 24 themes geres par
 * l'administration (R-T1, R-T2). `famille` organise les filtres (doc 03/04),
 * `accent` est l'une des six teintes papier du design system (V2-1),
 * fixee a la creation et jamais recalculee.
 */
export const tagFamilySchema = z.enum([
  'do',
  'help',
  'create',
  'learn',
  'live',
]);
export type TagFamily = z.infer<typeof tagFamilySchema>;

export const tagAccentSchema = z.enum([
  'rose',
  'orange',
  'yellow',
  'apple',
  'sky',
  'purple',
]);
export type TagAccent = z.infer<typeof tagAccentSchema>;

export const tagSchema = z.object({
  id: z.string().min(1).max(40), // slug stable, ex. "jeu-video"
  label: z.string().min(3).max(20),
  family: tagFamilySchema,
  accent: tagAccentSchema,
});
export type Tag = z.infer<typeof tagSchema>;

/**
 * Les 24 tags initiaux (doc 04 §7). L'accent tourne sur les six teintes dans
 * l'ordre de la liste pour repartir la couleur sans en privilegier une par
 * famille — le doc ne fixe pas la couleur exacte de chaque tag.
 */
const ACCENT_CYCLE: TagAccent[] = [
  'rose',
  'orange',
  'yellow',
  'apple',
  'sky',
  'purple',
];

const TAG_SEED: { id: string; label: string; family: TagFamily }[] = [
  { id: 'bricolage', label: 'Bricolage', family: 'do' },
  { id: 'jardinage', label: 'Jardinage', family: 'do' },
  { id: 'reparation', label: 'Réparation', family: 'do' },
  { id: 'cuisine', label: 'Cuisine', family: 'do' },
  { id: 'solidarite', label: 'Solidarité', family: 'help' },
  { id: 'environnement', label: 'Environnement', family: 'help' },
  { id: 'quartier', label: 'Quartier', family: 'help' },
  { id: 'animaux', label: 'Animaux', family: 'help' },
  { id: 'musique', label: 'Musique', family: 'create' },
  { id: 'dessin', label: 'Dessin', family: 'create' },
  { id: 'video', label: 'Vidéo', family: 'create' },
  { id: 'ecriture', label: 'Écriture', family: 'create' },
  { id: 'jeu-video', label: 'Jeu vidéo', family: 'create' },
  { id: 'code', label: 'Code', family: 'create' },
  { id: 'photo', label: 'Photo', family: 'create' },
  { id: 'langues', label: 'Langues', family: 'learn' },
  { id: 'sciences', label: 'Sciences', family: 'learn' },
  { id: 'histoire', label: 'Histoire', family: 'learn' },
  { id: 'entraide-scolaire', label: 'Entraide scolaire', family: 'learn' },
  { id: 'sport', label: 'Sport', family: 'live' },
  { id: 'evenement', label: 'Événement', family: 'live' },
  { id: 'voyage', label: 'Voyage', family: 'live' },
  { id: 'jeux', label: 'Jeux', family: 'live' },
  { id: 'spectacle', label: 'Spectacle', family: 'live' },
];

export const TAGS: Tag[] = TAG_SEED.map((seed, index) =>
  tagSchema.parse({
    ...seed,
    accent: ACCENT_CYCLE[index % ACCENT_CYCLE.length],
  }),
);

const TAG_BY_ID = new Map(TAGS.map((tag) => [tag.id, tag]));

/** Resout un id de tag vers sa fiche complete (label, accent fixe, famille). */
export function getTagById(id: string): Tag | undefined {
  return TAG_BY_ID.get(id);
}
