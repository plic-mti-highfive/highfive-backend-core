import { describe, expect, it } from 'vitest';
import type { ProjectEntity, UserEntity } from '../../entities/index.js';
import { assertCanCustomize, thumbKeyFor } from './customization.service.js';

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
