import { describe, expect, it } from 'vitest';
import type { ProjectCustomization } from '../../contracts/index.js';
import {
  hydrate,
  referencedImageIds,
  toStored,
  withoutImage,
} from './customization.logic.js';

const SECTIONS = ['pinned', 'needs', 'about', 'gallery', 'comments'].map(
  (id) => ({ id, visible: true }),
) as ProjectCustomization['sections'];

const full: ProjectCustomization = {
  banner: {
    id: 'b1',
    url: 'https://x/b1',
    alt: 'Banniere',
    focal: { x: 10, y: 20 },
  },
  theme: {
    background: '#ffffff',
    panel: '#eeeeee',
    text: '#000000',
    accent: '#3366ff',
  },
  sections: SECTIONS,
  gallery: [
    { id: 'g1', url: 'https://x/g1', alt: 'Un', caption: 'Legende' },
    { id: 'g2', url: 'https://x/g2', alt: 'Deux' },
  ],
};

describe('referencedImageIds', () => {
  it('liste la banniere puis la galerie', () => {
    expect(referencedImageIds(full)).toEqual(['b1', 'g1', 'g2']);
    expect(referencedImageIds({ sections: SECTIONS, gallery: [] })).toEqual([]);
  });
});

describe('toStored', () => {
  it('ne conserve jamais les URL (signees, elles expirent)', () => {
    const stored = toStored(full);
    expect(JSON.stringify(stored)).not.toContain('https://x/');
    expect(stored.banner).toEqual({
      id: 'b1',
      alt: 'Banniere',
      focal: { x: 10, y: 20 },
    });
    expect(stored.gallery).toEqual([
      { id: 'g1', alt: 'Un', caption: 'Legende' },
      { id: 'g2', alt: 'Deux' },
    ]);
    expect(stored.theme).toEqual(full.theme);
  });
});

describe('hydrate', () => {
  it('rend les URL du moment', () => {
    const urls = new Map([
      ['b1', 'https://signed/b1'],
      ['g1', 'https://signed/g1'],
      ['g2', 'https://signed/g2'],
    ]);
    const result = hydrate(toStored(full), urls);
    expect(result.banner?.url).toBe('https://signed/b1');
    expect(result.gallery.map((i) => i.url)).toEqual([
      'https://signed/g1',
      'https://signed/g2',
    ]);
    expect(result.sections).toEqual(SECTIONS);
  });

  it('omet une image dont la ligne a disparu plutot que casser le contrat', () => {
    const result = hydrate(
      toStored(full),
      new Map([['g2', 'https://signed/g2']]),
    );
    expect(result.banner).toBeUndefined();
    expect(result.gallery.map((i) => i.id)).toEqual(['g2']);
  });
});

describe('withoutImage', () => {
  it('retire la banniere sans toucher la galerie', () => {
    const result = withoutImage(toStored(full), 'b1');
    expect(result.banner).toBeUndefined();
    expect(result.gallery).toHaveLength(2);
  });

  it('retire une image de la galerie sans toucher la banniere', () => {
    const result = withoutImage(toStored(full), 'g1');
    expect(result.banner?.id).toBe('b1');
    expect(result.gallery.map((i) => i.id)).toEqual(['g2']);
  });

  it('ne mute pas l original (les entites sont partagees)', () => {
    const stored = toStored(full);
    withoutImage(stored, 'g1');
    expect(stored.gallery).toHaveLength(2);
  });
});
