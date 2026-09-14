import { describe, expect, it } from 'vitest';
import {
  clampLimit,
  decodeCursor,
  encodeCursor,
  paginateArray,
  toPage,
} from './pagination.js';

describe('curseur', () => {
  it('fait un aller-retour', () => {
    expect(decodeCursor(encodeCursor(40))).toBe(40);
  });

  it('traite un curseur absent comme le debut', () => {
    expect(decodeCursor(undefined)).toBe(0);
  });

  it('refuse un curseur qui ne decode pas vers un entier positif', () => {
    expect(() => decodeCursor('pas-un-curseur')).toThrow();
  });
});

describe('limite', () => {
  it('applique la taille de page par defaut', () => {
    expect(clampLimit(undefined)).toBe(20);
  });

  it('borne les valeurs extremes', () => {
    expect(clampLimit(0)).toBe(20);
    expect(clampLimit(1000)).toBe(100);
    expect(clampLimit(7)).toBe(7);
  });
});

describe('page', () => {
  it('annonce la page suivante tant qu il reste des elements', () => {
    const page = toPage(['a', 'b'], 5, 0);
    expect(page.nextCursor).not.toBeNull();
    expect(page.total).toBe(5);
  });

  it('renvoie un curseur nul sur la derniere page', () => {
    expect(toPage(['e'], 5, 4).nextCursor).toBeNull();
  });

  it('pagine un tableau deja charge', () => {
    const all = Array.from({ length: 25 }, (_, i) => i);
    const first = paginateArray(all, undefined, 10);
    expect(first.items).toHaveLength(10);

    const second = paginateArray(all, first.nextCursor!, 10);
    expect(second.items[0]).toBe(10);
    expect(paginateArray(all, second.nextCursor!, 10).nextCursor).toBeNull();
  });
});
