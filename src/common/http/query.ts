/**
 * Conversion des parametres de requete (toujours des chaines en HTTP) vers les
 * types attendus par les schemas zod du contrat.
 */

/** `?tags=a,b` et `?tags=a&tags=b` designent la meme liste. */
export function parseList(raw: unknown): string[] | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;

  const values = Array.isArray(raw)
    ? raw
    : typeof raw === 'string'
      ? raw.split(',')
      : [];

  const cleaned = values
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    .filter(Boolean);

  return cleaned.length > 0 ? cleaned : undefined;
}

export function parseInteger(raw: unknown): number | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : undefined;
}

export function parseString(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  return trimmed === '' ? undefined : trimmed;
}
