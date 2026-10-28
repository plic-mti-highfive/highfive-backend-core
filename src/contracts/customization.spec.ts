import { describe, expect, it } from 'vitest';
import {
  adminProjectMediaSchema,
  projectCustomizationSchema,
  projectSchema,
  projectSummarySchema,
  type ProjectCustomization,
} from './index.js';

const ID = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const URL_OK = 'https://cdn.example.com/a.webp';

const sections = (ids = ['pinned', 'needs', 'about', 'gallery', 'comments']) =>
  ids.map((id) => ({ id, visible: true }));

const valid = (
  overrides: Partial<ProjectCustomization> = {},
): ProjectCustomization =>
  ({
    sections: sections(),
    gallery: [],
    ...overrides,
  }) as ProjectCustomization;

const image = (n: number, alt = 'Une image') => ({
  id: ID(n),
  url: URL_OK,
  alt,
});

describe('projectCustomizationSchema', () => {
  it('accepte une personnalisation minimale', () => {
    expect(projectCustomizationSchema.safeParse(valid()).success).toBe(true);
  });

  it('accepte une personnalisation d avant la section needs', () => {
    const old = valid({
      sections: sections(['pinned', 'about', 'gallery', 'comments']) as never,
    });
    expect(projectCustomizationSchema.safeParse(old).success).toBe(true);
  });

  it('refuse une section manquante ou dupliquee', () => {
    const missing = valid({
      sections: sections(['pinned', 'about', 'gallery', 'needs']) as never,
    });
    const duplicated = valid({
      sections: sections([
        'pinned',
        'about',
        'gallery',
        'comments',
        'about',
      ]) as never,
    });
    expect(projectCustomizationSchema.safeParse(missing).success).toBe(false);
    expect(projectCustomizationSchema.safeParse(duplicated).success).toBe(
      false,
    );
  });

  it('refuse plus de 8 images et des id de galerie dupliques', () => {
    const nine = valid({
      gallery: Array.from({ length: 9 }, (_, i) => image(i + 1)),
    });
    const twice = valid({ gallery: [image(1), image(1)] });
    expect(projectCustomizationSchema.safeParse(nine).success).toBe(false);
    expect(projectCustomizationSchema.safeParse(twice).success).toBe(false);
  });

  it('exige un texte alternatif non vide, sans exception', () => {
    const blank = valid({ gallery: [image(1, '   ')] });
    expect(projectCustomizationSchema.safeParse(blank).success).toBe(false);
  });

  it('refuse une URL d image qui n est ni http(s) ni data:image', () => {
    const bad = valid({
      gallery: [{ ...image(1), url: 'javascript:alert(1)' }],
    });
    expect(projectCustomizationSchema.safeParse(bad).success).toBe(false);
  });

  it('borne le point focal de la banniere a 0..100', () => {
    const banner = (x: number, y: number) =>
      valid({ banner: { ...image(1), focal: { x, y } } });
    expect(projectCustomizationSchema.safeParse(banner(0, 100)).success).toBe(
      true,
    );
    expect(projectCustomizationSchema.safeParse(banner(101, 50)).success).toBe(
      false,
    );
  });

  it('exige la palette entiere, en #rrggbb minuscules', () => {
    const theme = {
      background: '#ffffff',
      panel: '#f5f5f5',
      text: '#111111',
      accent: '#3366ff',
    };
    expect(projectCustomizationSchema.safeParse(valid({ theme })).success).toBe(
      true,
    );
    expect(
      projectCustomizationSchema.safeParse(
        valid({ theme: { ...theme, accent: '#3366FF' } }),
      ).success,
    ).toBe(false);
    const partial: Partial<typeof theme> = { ...theme };
    delete partial.text;
    expect(
      projectCustomizationSchema.safeParse(valid({ theme: partial as never }))
        .success,
    ).toBe(false);
  });
});

describe('contrat projet', () => {
  const base = {
    id: ID(1),
    slug: 'mon-projet',
    title: 'Mon projet',
    tagline: 'Une accroche',
    tags: ['code'],
    needs: [],
    visibility: 'public',
    participation: 'open',
    state: 'active',
    ownerId: ID(2),
    highfiveCount: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    lastActivityAt: '2026-01-01T00:00:00.000Z',
  };

  it('Project porte une personnalisation optionnelle', () => {
    expect(projectSchema.safeParse(base).success).toBe(true);
    const withCustomization = projectSchema.safeParse({
      ...base,
      customization: valid(),
    });
    expect(withCustomization.success).toBe(true);
    expect(withCustomization.data?.customization?.sections).toHaveLength(5);
  });

  it('ProjectSummary porte accent et banniere optionnels', () => {
    const summary = {
      ...base,
      membersCount: 1,
      teamPreview: [],
      owner: {
        id: ID(2),
        username: 'alex',
        avatar: 'https://cdn.example.com/a.png',
      },
      accent: '#3366ff',
      banner: { ...image(3), focal: { x: 50, y: 50 } },
    };
    const parsed = projectSummarySchema.safeParse(summary);
    expect(parsed.success).toBe(true);
    expect(parsed.data?.accent).toBe('#3366ff');
    expect(
      projectSummarySchema.safeParse({ ...summary, accent: 'bleu' }).success,
    ).toBe(false);
  });

  it('AdminProjectMedia liste banniere et galerie', () => {
    expect(adminProjectMediaSchema.safeParse({ gallery: [] }).success).toBe(
      true,
    );
    expect(adminProjectMediaSchema.safeParse({}).success).toBe(false);
  });
});
