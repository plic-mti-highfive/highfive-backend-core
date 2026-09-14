import { describe, expect, it } from 'vitest';
import { slugify } from './slug.js';

describe('slugify', () => {
  it('retire les accents et la ponctuation', () => {
    expect(slugify('Fresque murale collaborative')).toBe(
      'fresque-murale-collaborative',
    );
    expect(slugify('Repair café — mensuel !')).toBe('repair-cafe-mensuel');
  });

  it('ne laisse jamais de tiret en bord de chaine', () => {
    expect(slugify('  ??? Jardin ???  ')).toBe('jardin');
  });

  it('retombe sur un slug utilisable quand le titre ne donne rien', () => {
    // Un titre entierement non latin produirait sinon une chaine vide, donc
    // une route `/projets/` invalide.
    expect(slugify('日本語')).toBe('projet');
  });
});
