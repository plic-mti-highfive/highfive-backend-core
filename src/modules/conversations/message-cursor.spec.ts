import { describe, expect, it } from 'vitest';
import { ApiError } from '../../common/errors/api-error.js';
import { decodeMessageCursor, encodeMessageCursor } from './message-cursor.js';

describe('curseur des messages', () => {
  const cursor = {
    sentAt: new Date('2026-01-15T10:00:00.123Z'),
    id: '99999999-9999-4999-8999-999999999999',
  };

  it('fait l aller-retour a la milliseconde pres', () => {
    expect(decodeMessageCursor(encodeMessageCursor(cursor))).toEqual(cursor);
  });

  it('absent : premiere page', () => {
    expect(decodeMessageCursor(undefined)).toBeUndefined();
  });

  it.each([
    ['du texte quelconque', Buffer.from('nimporte quoi').toString('base64url')],
    [
      'une date invalide',
      Buffer.from(`hier|${cursor.id}`).toString('base64url'),
    ],
    [
      'un identifiant invalide',
      Buffer.from('2026-01-15T10:00:00.000Z|42').toString('base64url'),
    ],
    ['un curseur de decalage', Buffer.from('20').toString('base64url')],
  ])('refuse %s par une erreur 400', (_label, raw) => {
    expect(() => decodeMessageCursor(raw)).toThrow(ApiError);
  });
});
