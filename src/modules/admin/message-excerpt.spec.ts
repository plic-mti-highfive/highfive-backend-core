import { describe, expect, it } from 'vitest';
import { messageExcerpt } from './message-excerpt.js';

const message = (
  overrides: Partial<Parameters<typeof messageExcerpt>[0]> = {},
) => ({
  body: 'Bonjour',
  deleted: false,
  attachmentKind: null,
  ...overrides,
});

describe('messageExcerpt', () => {
  it('rend le texte du message', () => {
    expect(messageExcerpt(message())).toBe('Bonjour');
  });

  it('tronque a la borne du contrat (1000 caracteres)', () => {
    const excerpt = messageExcerpt(message({ body: 'a'.repeat(4000) }));
    expect(excerpt).toHaveLength(1000);
    expect(excerpt.endsWith('…')).toBe(true);
  });

  it('annonce la piece jointe d un message sans texte (R-MSG8)', () => {
    expect(
      messageExcerpt(
        message({ body: '', attachmentKind: 'upload' }),
        'photo.png',
      ),
    ).toBe('[Fichier joint : photo.png]');
  });

  it('dit qu un message a ete supprime plutot que de rendre un extrait vide', () => {
    expect(messageExcerpt(message({ body: '', deleted: true }))).toBe(
      'Message supprime par son auteur.',
    );
  });
});
