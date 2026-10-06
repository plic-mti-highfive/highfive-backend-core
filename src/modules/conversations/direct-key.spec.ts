import { describe, expect, it } from 'vitest';
import { directKeyOf } from './conversations.service.js';

describe('directKeyOf (R-MSG1)', () => {
  const alice = '11111111-1111-4111-8111-111111111111';
  const bob = '22222222-2222-4222-8222-222222222222';

  it('ne depend pas de qui ecrit le premier', () => {
    expect(directKeyOf(alice, bob)).toBe(directKeyOf(bob, alice));
  });

  it('tient dans la colonne direct_key (73 caracteres)', () => {
    expect(directKeyOf(alice, bob)).toHaveLength(73);
  });
});
