import { describe, expect, it } from 'vitest';
import type { ProjectEntity, UserEntity } from '../../entities/index.js';
import { canViewWith } from './project-access.service.js';

const project = (overrides: Partial<ProjectEntity> = {}): ProjectEntity =>
  ({ state: 'active', visibility: 'public', ...overrides }) as ProjectEntity;
const member = { platformRole: 'member' } as UserEntity;
const admin = { platformRole: 'admin' } as UserEntity;

describe('canViewWith', () => {
  it('un projet public actif est visible de tous, anonymes compris', () => {
    expect(canViewWith(project(), undefined, undefined)).toBe(true);
  });

  it('R-V3 : un projet prive ne se voit qu avec un role', () => {
    const hidden = project({ visibility: 'private' });
    expect(canViewWith(hidden, undefined, member)).toBe(false);
    expect(canViewWith(hidden, 'observer', member)).toBe(true);
  });

  it('R-PR2 : un brouillon n appartient qu a son porteur', () => {
    const draft = project({ state: 'draft' });
    expect(canViewWith(draft, 'co_owner', member)).toBe(false);
    expect(canViewWith(draft, 'owner', member)).toBe(true);
  });

  it('l administration voit tout', () => {
    expect(
      canViewWith(
        project({ state: 'draft', visibility: 'private' }),
        undefined,
        admin,
      ),
    ).toBe(true);
  });
});
