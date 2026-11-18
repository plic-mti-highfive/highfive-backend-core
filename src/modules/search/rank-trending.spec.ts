import { describe, expect, it } from 'vitest';
import type { ProjectEntity } from '../../entities/index.js';
import { rankTrending } from './search.service.js';

const project = (id: string, highfiveCount: number) =>
  ({ id, highfiveCount }) as ProjectEntity;

const ids = (projects: ProjectEntity[]) => projects.map((p) => p.id);

describe('rankTrending', () => {
  const pool = [
    project('ancien', 80),
    project('frais', 12),
    project('moyen', 30),
  ];

  it("suit l'ordre de l'IA plutot que le total", () => {
    expect(ids(rankTrending(pool, ['frais', 'moyen', 'ancien']))).toEqual([
      'frais',
      'moyen',
      'ancien',
    ]);
  });

  it('retombe sur le total sans reponse de l IA', () => {
    expect(ids(rankTrending(pool, []))).toEqual(['ancien', 'moyen', 'frais']);
  });

  it('complete le classement de l IA par le total', () => {
    expect(ids(rankTrending(pool, ['frais']))).toEqual([
      'frais',
      'ancien',
      'moyen',
    ]);
  });

  it("relegue un projet sans highfive, meme classe premier par l'IA", () => {
    const withNew = [...pool, project('nouveau', 0)];
    expect(
      ids(rankTrending(withNew, ['nouveau', 'frais', 'moyen', 'ancien'])),
    ).toEqual(['frais', 'moyen', 'ancien', 'nouveau']);
  });

  it("ignore les projets que l'IA connait mais hors du fil", () => {
    expect(ids(rankTrending(pool, ['prive', 'moyen']))).toEqual([
      'moyen',
      'ancien',
      'frais',
    ]);
  });
});
