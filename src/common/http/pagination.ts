import type { Paginated } from '../../contracts/index.js';
import { ApiError } from '../errors/api-error.js';

/** Taille de page par defaut du contrat (SPEC.md §1.4). */
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/**
 * Curseur opaque encodant un decalage.
 *
 * Le contrat n'impose que l'opacite du curseur cote client. Le decalage est
 * assume ici pour la volumetrie attendue ; SPEC.md §1.4 recommande de passer
 * a un curseur keyset (`created_at`/`id`) le jour ou une liste depasse
 * quelques milliers de lignes — c'est alors le seul endroit a changer.
 */
export function encodeCursor(offset: number): string {
  return Buffer.from(String(offset), 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string | undefined): number {
  if (!cursor) return 0;
  const decoded = Number(Buffer.from(cursor, 'base64url').toString('utf8'));
  if (!Number.isInteger(decoded) || decoded < 0) {
    throw ApiError.validation("Ce curseur de pagination n'est pas valide.");
  }
  return decoded;
}

export function clampLimit(limit: number | undefined): number {
  if (!limit) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.max(limit, 1), MAX_PAGE_SIZE);
}

/** Assemble une page a partir d'un total et d'une tranche deja lue en base. */
export function toPage<T>(
  items: T[],
  total: number,
  offset: number,
): Paginated<T> {
  const consumed = offset + items.length;
  return {
    items,
    nextCursor: consumed < total ? encodeCursor(consumed) : null,
    total,
  };
}

/** Pagination en memoire, pour les listes deja entierement chargees. */
export function paginateArray<T>(
  all: T[],
  cursor: string | undefined,
  limit: number | undefined,
): Paginated<T> {
  const offset = decodeCursor(cursor);
  const size = clampLimit(limit);
  return toPage(all.slice(offset, offset + size), all.length, offset);
}
