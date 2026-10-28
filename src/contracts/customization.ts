import { z } from 'zod';
import { idSchema } from './common.js';

/**
 * Personnalisation de la fiche projet (docs/v2/customization-scope.md).
 * Reservee au porteur ; optionnelle : `Project.customization` absent = fiche
 * par defaut (theme du site, sections dans l'ordre par defaut, ni banniere
 * ni galerie).
 *
 * Pas de CSS libre : le theme est une palette de quatre couleurs (`#rrggbb`)
 * dont le front derive le reste au contraste garanti
 * (`src/shared/lib/projectTheme.ts`) ; les images passent par l'API d'upload.
 */

/** Couleur : `#rrggbb` en minuscules (le client normalise la saisie). */
export const hexColorSchema = z
  .string()
  .regex(/^#[0-9a-f]{6}$/, 'couleur invalide (#rrggbb en minuscules)');

/** Couleur d'identite d'un projet (`theme.accent`), aussi copiee sur ses cartes. */
export const accentColorSchema = hexColorSchema;
export type AccentColor = z.infer<typeof accentColorSchema>;

/**
 * Palette de la fiche : quatre couleurs, toutes obligatoires (une palette
 * est un tout, pas une couleur isolee). Absente = la fiche suit le theme du
 * site. La fiche impose sa palette quel que soit le theme clair/sombre du
 * visiteur ; le front en derive le reste (bordures, texte secondaire, texte
 * des boutons) et corrige les couleurs trop peu contrastees
 * (`src/shared/lib/projectTheme.ts`).
 */
export const projectThemeSchema = z.object({
  /** Fond de la page. */
  background: hexColorSchema,
  /** Fond des blocs (cartes, commentaires, panneaux). */
  panel: hexColorSchema,
  /** Texte principal. */
  text: hexColorSchema,
  /** Liens, boutons, onglet actif, puces et anneaux de focus. */
  accent: accentColorSchema,
});
export type ProjectTheme = z.infer<typeof projectThemeSchema>;

/** Nombre maximal d'images dans la galerie d'un projet. */
export const MAX_GALLERY_IMAGES = 8;

/**
 * URL d'image : http(s) (backend reel) ou `data:image/` (mock MSW).
 * Jamais `javascript:` ni un autre schema.
 */
const imageUrlSchema = z
  .string()
  .regex(/^(https?:\/\/|data:image\/)/, "url d'image invalide");

/**
 * Champs communs d'une image personnalisee. Accessibilite : le texte
 * alternatif est toujours obligatoire, y compris pour une image purement
 * decorative (il n'y a pas d'exception : la description reste utile, et
 * l'image reste ouvrable en grand).
 */
const imageFields = {
  id: idSchema,
  url: imageUrlSchema,
  alt: z.string().trim().min(1, 'Un texte alternatif est requis.').max(200),
};

/** Reponse de `POST /projects/:slug/customization/images` : l'image est televersee, pas encore referencee. */
export const customizationImageUploadSchema = z.object({
  id: idSchema,
  url: imageUrlSchema,
});
export type CustomizationImageUpload = z.infer<
  typeof customizationImageUploadSchema
>;

/** Point focal de la banniere, en pourcentage (0 = bord haut/gauche, 100 = bord bas/droit). */
export const bannerFocalSchema = z.object({
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
});
export type BannerFocal = z.infer<typeof bannerFocalSchema>;

export const projectBannerSchema = z.object({
  ...imageFields,
  focal: bannerFocalSchema,
});
export type ProjectBanner = z.infer<typeof projectBannerSchema>;

export const galleryItemSchema = z.object({
  ...imageFields,
  caption: z.string().max(140).optional(),
});
export type GalleryItem = z.infer<typeof galleryItemSchema>;

/** Sections de l'onglet Apercu que le porteur peut ordonner et masquer (la sidebar reste fixe). */
export const customizationSectionIdSchema = z.enum([
  'pinned',
  'needs',
  'about',
  'gallery',
  'comments',
]);
export type CustomizationSectionId = z.infer<
  typeof customizationSectionIdSchema
>;

export const customizationSectionSchema = z.object({
  id: customizationSectionIdSchema,
  visible: z.boolean(),
});
export type CustomizationSection = z.infer<typeof customizationSectionSchema>;

/** Ordre et visibilite par defaut : celui de la fiche d'un projet non personnalise. */
export const DEFAULT_SECTIONS: readonly CustomizationSection[] = [
  { id: 'pinned', visible: true },
  { id: 'needs', visible: true },
  { id: 'about', visible: true },
  { id: 'gallery', visible: true },
  { id: 'comments', visible: true },
];

/** Sections presentes dans toute personnalisation, y compris celles d'avant `needs`. */
const REQUIRED_SECTION_IDS: readonly CustomizationSectionId[] = [
  'pinned',
  'about',
  'gallery',
  'comments',
];

/**
 * Corps de `PATCH /projects/:slug/customization` (remplacement complet) et
 * champ `Project.customization`. Regles non representees dans le JSON Schema
 * (voir docs/v2/backend/SPEC.md) : `sections` contient `pinned`, `about`,
 * `gallery` et `comments` exactement une fois, et `needs` au plus une fois
 * (absente des personnalisations enregistrees avant son ajout) ; les `id` de
 * la galerie sont uniques.
 */
export const projectCustomizationSchema = z
  .object({
    banner: projectBannerSchema.optional(),
    theme: projectThemeSchema.optional(),
    sections: z.array(customizationSectionSchema).min(4).max(5),
    gallery: z.array(galleryItemSchema).max(MAX_GALLERY_IMAGES),
  })
  .superRefine((customization, ctx) => {
    const sectionIds = new Set(customization.sections.map((s) => s.id));
    const allDistinct = sectionIds.size === customization.sections.length;
    const hasRequired = REQUIRED_SECTION_IDS.every((id) => sectionIds.has(id));
    if (!allDistinct || !hasRequired) {
      ctx.addIssue({
        code: 'custom',
        message:
          'Chaque section (pinned, about, gallery, comments) doit apparaitre exactement une fois, et needs au plus une fois.',
        path: ['sections'],
      });
    }
    const galleryIds = new Set(customization.gallery.map((item) => item.id));
    if (galleryIds.size !== customization.gallery.length) {
      ctx.addIssue({
        code: 'custom',
        message: 'Les images de la galerie doivent avoir des id distincts.',
        path: ['gallery'],
      });
    }
  });
export type ProjectCustomization = z.infer<typeof projectCustomizationSchema>;
