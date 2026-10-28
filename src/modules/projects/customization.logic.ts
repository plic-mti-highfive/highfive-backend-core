import type {
  CustomizationSection,
  GalleryItem,
  ProjectBanner,
  ProjectCustomization,
  ProjectTheme,
} from '../../contracts/index.js';

/**
 * Forme persistee de la personnalisation : celle du contrat, sans les URL.
 * Une URL est signee a la lecture (elle expire) : la stocker figerait un lien
 * mort. Seul l'id d'image est durable.
 */
export interface StoredCustomization {
  banner?: Omit<ProjectBanner, 'url'>;
  theme?: ProjectTheme;
  sections: CustomizationSection[];
  gallery: Omit<GalleryItem, 'url'>[];
}

export const referencedImageIds = <
  T extends { banner?: { id: string }; gallery: { id: string }[] },
>(
  c: T,
): string[] => [
  ...(c.banner ? [c.banner.id] : []),
  ...c.gallery.map((i) => i.id),
];

export function toStored(c: ProjectCustomization): StoredCustomization {
  return {
    ...(c.banner && {
      banner: { id: c.banner.id, alt: c.banner.alt, focal: c.banner.focal },
    }),
    ...(c.theme && { theme: c.theme }),
    sections: c.sections,
    gallery: c.gallery.map(({ id, alt, caption }) => ({
      id,
      alt,
      ...(caption !== undefined && { caption }),
    })),
  };
}

/**
 * Une image dont la ligne a disparu est omise : mieux vaut une fiche sans elle
 * qu'un contrat invalide (URL absente) qui ferait echouer toute la lecture.
 */
export function hydrate(
  stored: StoredCustomization,
  urls: ReadonlyMap<string, string>,
): ProjectCustomization {
  const banner = stored.banner && urls.get(stored.banner.id);
  return {
    ...(stored.banner &&
      banner && { banner: { ...stored.banner, url: banner } }),
    ...(stored.theme && { theme: stored.theme }),
    sections: stored.sections,
    gallery: stored.gallery.flatMap((item) => {
      const url = urls.get(item.id);
      return url ? [{ ...item, url }] : [];
    }),
  };
}

/** Nouvel objet : les entites chargees sont partagees, ne jamais muter en place. */
export function withoutImage(
  stored: StoredCustomization,
  imageId: string,
): StoredCustomization {
  const { banner, ...rest } = stored;
  return {
    ...rest,
    ...(banner && banner.id !== imageId && { banner }),
    gallery: stored.gallery.filter((item) => item.id !== imageId),
  };
}
