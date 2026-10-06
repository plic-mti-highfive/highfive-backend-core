import { idSchema } from '../../contracts/index.js';
import { ApiError } from '../../common/errors/api-error.js';

/**
 * Curseur keyset des messages : le `(sent_at, id)` du plus ancien message de
 * la page precedente. Contrairement au decalage du reste de l'API
 * (`common/http/pagination.ts`), il ne glisse pas quand de nouveaux messages
 * arrivent pendant qu'on remonte le fil — ce qui, dans une conversation
 * active, ferait relire ou sauter des messages.
 *
 * `sent_at` est stocke a la milliseconde (`timestamptz(3)`), la precision
 * d'une `Date` JavaScript : la comparaison est donc exacte.
 */
export interface MessageCursor {
  sentAt: Date;
  id: string;
}

export function encodeMessageCursor(cursor: MessageCursor): string {
  return Buffer.from(
    `${cursor.sentAt.toISOString()}|${cursor.id}`,
    'utf8',
  ).toString('base64url');
}

export function decodeMessageCursor(
  raw: string | undefined,
): MessageCursor | undefined {
  if (!raw) return undefined;
  const [iso, id, ...rest] = Buffer.from(raw, 'base64url')
    .toString('utf8')
    .split('|');
  const sentAt = new Date(iso ?? '');
  if (
    rest.length > 0 ||
    Number.isNaN(sentAt.getTime()) ||
    !idSchema.safeParse(id).success
  ) {
    throw ApiError.validation("Ce curseur de pagination n'est pas valide.");
  }
  return { sentAt, id };
}
