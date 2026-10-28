import { describe, expect, it } from 'vitest';
import type { ProjectEntity, UserEntity } from '../../entities/index.js';
import {
  assertCanCustomize,
  thumbKeyFor,
  toStored,
} from './customization.service.js';

const project = { ownerId: 'porteur' } as ProjectEntity;
const user = (id: string, accountStatus: UserEntity['accountStatus']) =>
  ({ id, accountStatus }) as UserEntity;

describe('assertCanCustomize', () => {
  it('laisse passer le porteur actif', () => {
    expect(() =>
      assertCanCustomize(project, user('porteur', 'active')),
    ).not.toThrow();
  });

  it('refuse toute autre personne, co-porteur compris', () => {
    expect(() =>
      assertCanCustomize(project, user('co-porteur', 'active')),
    ).toThrow(/Seul le porteur/);
  });

  it('refuse le porteur suspendu', () => {
    expect(() =>
      assertCanCustomize(project, user('porteur', 'suspended')),
    ).toThrow(/suspendu/);
  });
});

describe('thumbKeyFor', () => {
  it("range la miniature a cote de l'original", () => {
    expect(thumbKeyFor('customization/p/abc.avif', 640)).toBe(
      'customization/p/abc-640.webp',
    );
  });
});

describe('toStored', () => {
  const sections = [
    { id: 'pinned', visible: true },
    { id: 'about', visible: true },
    { id: 'gallery', visible: true },
    { id: 'comments', visible: true },
  ] as const;

  it("ne garde que l'id des images, jamais l'URL envoyee", () => {
    const stored = toStored({
      banner: {
        id: 'banniere',
        url: 'https://ailleurs.example/piege.png',
        alt: 'Banniere',
        focal: { x: 10, y: 90 },
      },
      sections: [...sections],
      gallery: [
        { id: 'photo', url: 'https://ailleurs.example/x.png', alt: 'Photo' },
      ],
    });
    expect(stored).toEqual({
      banner: { imageId: 'banniere', alt: 'Banniere', focal: { x: 10, y: 90 } },
      sections,
      gallery: [{ imageId: 'photo', alt: 'Photo' }],
    });
    expect(JSON.stringify(stored)).not.toContain('ailleurs.example');
  });
});
