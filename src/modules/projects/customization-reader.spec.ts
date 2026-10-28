import { describe, expect, it } from 'vitest';
import {
  projectCustomizationSchema,
  projectUpdateInputSchema,
} from '../../contracts/index.js';
import type { StoredCustomization } from '../../entities/index.js';
import { toProject } from '../../common/mappers/index.js';
import type { ProjectEntity } from '../../entities/index.js';
import {
  materialize,
  referencedImageIds,
} from './customization-reader.service.js';

const BANNER = '33333333-3333-4333-8333-333333333333';
const PHOTO_A = '44444444-4444-4444-8444-444444444444';
const PHOTO_B = '55555555-5555-4555-8555-555555555555';
const url = (id: string) =>
  `https://stockage.example/customization/${id}.webp?X-Amz-Signature=x`;

const stored: StoredCustomization = {
  banner: { imageId: BANNER, alt: 'Le mur repeint', focal: { x: 50, y: 30 } },
  theme: {
    background: '#fdf6e3',
    panel: '#ffffff',
    text: '#222222',
    accent: '#3a7f6b',
  },
  sections: [
    { id: 'about', visible: true },
    { id: 'gallery', visible: true },
    { id: 'pinned', visible: false },
    { id: 'comments', visible: true },
  ],
  gallery: [
    { imageId: PHOTO_A, alt: 'Esquisse', caption: 'Premier jet' },
    { imageId: PHOTO_B, alt: 'Chantier' },
  ],
};

describe('materialize', () => {
  it('remplace chaque reference par son URL et respecte le contrat', () => {
    const urls = new Map([BANNER, PHOTO_A, PHOTO_B].map((id) => [id, url(id)]));
    const { customization, missing } = materialize(stored, urls);
    expect(missing).toEqual([]);
    expect(customization.banner).toEqual({
      id: BANNER,
      url: url(BANNER),
      alt: 'Le mur repeint',
      focal: { x: 50, y: 30 },
    });
    expect(customization.gallery.map((item) => item.id)).toEqual([
      PHOTO_A,
      PHOTO_B,
    ]);
    expect(customization.gallery[1]).not.toHaveProperty('caption');
    expect(() => projectCustomizationSchema.parse(customization)).not.toThrow();
  });

  it('omet une image introuvable et la signale', () => {
    const urls = new Map([[PHOTO_B, url(PHOTO_B)]]);
    const { customization, missing } = materialize(stored, urls);
    expect(missing).toEqual([BANNER, PHOTO_A]);
    expect(customization).not.toHaveProperty('banner');
    expect(customization.gallery.map((item) => item.id)).toEqual([PHOTO_B]);
    expect(() => projectCustomizationSchema.parse(customization)).not.toThrow();
  });

  it("sans banniere ni theme, n'invente aucun champ", () => {
    const { customization } = materialize(
      { sections: stored.sections, gallery: [] },
      new Map(),
    );
    expect(customization).toEqual({ sections: stored.sections, gallery: [] });
  });
});

describe('referencedImageIds', () => {
  it('banniere puis galerie', () => {
    expect(referencedImageIds(stored)).toEqual([BANNER, PHOTO_A, PHOTO_B]);
  });
});

describe('toProject et la personnalisation', () => {
  const project = {
    tags: [],
    needs: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    lastActivityAt: new Date(),
  } as unknown as ProjectEntity;

  it('fiche par defaut : champ absent, jamais null', () => {
    expect(toProject(project)).not.toHaveProperty('customization', null);
    expect(JSON.parse(JSON.stringify(toProject(project)))).not.toHaveProperty(
      'customization',
    );
  });
});

describe('PATCH /projects/:slug (D6)', () => {
  it('ignore un champ customization', () => {
    const parsed = projectUpdateInputSchema.parse({
      title: 'Nouveau titre',
      customization: { sections: [], gallery: [] },
    });
    expect(parsed).not.toHaveProperty('customization');
  });
});
