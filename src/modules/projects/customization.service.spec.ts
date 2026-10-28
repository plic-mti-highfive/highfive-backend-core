import { describe, expect, it, vi } from 'vitest';
import type { ProjectCustomization } from '../../contracts/index.js';
import type { ProjectEntity, UserEntity } from '../../entities/index.js';
import { ApiError } from '../../common/errors/api-error.js';
import { CustomizationService } from './customization.service.js';
import { toStored } from './customization.logic.js';

const SECTIONS = ['pinned', 'needs', 'about', 'gallery', 'comments'].map(
  (id) => ({ id, visible: true }),
) as ProjectCustomization['sections'];

const owner = { id: 'owner', platformRole: 'member' } as UserEntity;
const coOwner = { id: 'co', platformRole: 'member' } as UserEntity;
const admin = { id: 'admin', platformRole: 'admin' } as UserEntity;

const WEBP = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.from([0x24, 0, 0, 0]),
  Buffer.from('WEBPVP8 '),
]);
const file = (
  buffer: Buffer,
  mimetype = 'image/webp',
  size = buffer.length,
) => ({
  originalname: 'a.webp',
  mimetype,
  size,
  buffer,
});

async function status(promise: Promise<unknown>): Promise<number | 'ok'> {
  try {
    await promise;
    return 'ok';
  } catch (error) {
    if (error instanceof ApiError) return error.getStatus();
    throw error;
  }
}

function setup(stored?: ProjectEntity['customization']) {
  const project = {
    id: 'p1',
    slug: 'mon-projet',
    ownerId: 'owner',
    title: 'Mon projet',
    tags: [],
    needs: [],
    customization: stored ?? null,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastActivityAt: new Date(),
  } as unknown as ProjectEntity;

  const projects = { update: vi.fn().mockResolvedValue(undefined) };
  const actions = {
    create: vi.fn((value: unknown) => value),
    save: vi.fn().mockResolvedValue(undefined),
  };
  const access = {
    findBySlugOrFail: vi.fn((slug: string) =>
      slug === project.slug
        ? Promise.resolve(project)
        : Promise.reject(ApiError.notFound()),
    ),
    touch: vi.fn().mockResolvedValue(undefined),
  };
  const known = new Set(['img1']);
  const row = { id: 'img1', projectId: 'p1', storageKey: 'k/img1' };
  const images = {
    idsOf: vi.fn().mockResolvedValue(known),
    count: vi.fn().mockResolvedValue(0),
    add: vi.fn().mockResolvedValue({ id: 'new', url: 'https://signed/new' }),
    find: vi.fn((_p: string, id: string) =>
      Promise.resolve(id === 'img1' ? row : null),
    ),
    remove: vi.fn().mockResolvedValue(undefined),
    hydrate: vi.fn((s: ProjectEntity['customization']) =>
      Promise.resolve(s ? { ...s, gallery: [], banner: undefined } : undefined),
    ),
  };
  const notifications = { notify: vi.fn().mockResolvedValue(undefined) };

  const service = new CustomizationService(
    projects as never,
    actions as never,
    access as never,
    images as never,
    notifications as never,
  );
  return { service, project, projects, actions, access, images, notifications };
}

const body = (
  overrides: Partial<ProjectCustomization> = {},
): ProjectCustomization => ({
  sections: SECTIONS,
  gallery: [],
  ...overrides,
});
const withImage = body({
  gallery: [{ id: 'img1', url: 'https://x/img1', alt: 'Une image' }],
});

describe('CustomizationService.update', () => {
  it('reserve la personnalisation au porteur (un co-porteur : 403)', async () => {
    const { service, projects } = setup();
    expect(await status(service.update('mon-projet', coOwner, body()))).toBe(
      403,
    );
    expect(projects.update).not.toHaveBeenCalled();
  });

  it('projet inconnu : 404', async () => {
    const { service } = setup();
    expect(await status(service.update('absent', owner, body()))).toBe(404);
  });

  it('refuse une image qui n est pas televersee pour ce projet : 400', async () => {
    const { service, projects } = setup();
    const foreign = body({
      gallery: [{ id: 'autre', url: 'https://x/autre', alt: 'Une image' }],
    });
    expect(await status(service.update('mon-projet', owner, foreign))).toBe(
      400,
    );
    expect(projects.update).not.toHaveBeenCalled();
  });

  it('enregistre sans les URL, remonte l activite et renvoie le projet complet', async () => {
    const { service, projects, access } = setup();
    const result = await service.update('mon-projet', owner, withImage);

    const [, patch] = projects.update.mock.calls[0] as unknown as [
      unknown,
      { customization: unknown },
    ];
    expect(patch.customization).toEqual(toStored(withImage));
    expect(JSON.stringify(patch.customization)).not.toContain('https://');
    expect(access.touch).toHaveBeenCalledWith('p1');
    expect(result.slug).toBe('mon-projet');
    expect(result.customization).toBeDefined();
  });
});

describe('CustomizationService.upload', () => {
  it('porteur seul : 403 pour un autre', async () => {
    const { service } = setup();
    expect(
      await status(service.upload('mon-projet', coOwner, file(WEBP))),
    ).toBe(403);
  });

  it('accepte une image reelle et renvoie {id, url}', async () => {
    const { service, images } = setup();
    const result = await service.upload('mon-projet', owner, file(WEBP));
    expect(result).toEqual({ id: 'new', url: 'https://signed/new' });
    expect(images.add).toHaveBeenCalledWith(
      'p1',
      expect.anything(),
      'image/webp',
    );
  });

  it('juge le contenu, pas le type annonce : un PDF deguise en image est refuse', async () => {
    const { service, images } = setup();
    const pdf = file(Buffer.from('%PDF-1.4 ....'), 'image/webp');
    expect(await status(service.upload('mon-projet', owner, pdf))).toBe(400);
    expect(images.add).not.toHaveBeenCalled();
  });

  it('refuse le GIF (l animation serait perdue)', async () => {
    const { service } = setup();
    const gif = file(Buffer.from('GIF89a......'), 'image/gif');
    expect(await status(service.upload('mon-projet', owner, gif))).toBe(400);
  });

  it('refuse plus de 2 Mo', async () => {
    const { service } = setup();
    const big = file(WEBP, 'image/webp', 2 * 1024 * 1024 + 1);
    expect(await status(service.upload('mon-projet', owner, big))).toBe(400);
  });

  it('plafonne le nombre d images televersees par projet', async () => {
    const { service, images } = setup();
    images.count.mockResolvedValue(20);
    expect(await status(service.upload('mon-projet', owner, file(WEBP)))).toBe(
      400,
    );
  });
});

describe('CustomizationService.remove', () => {
  const stored = toStored(withImage);

  it('le porteur retire son image et la reference est purgee, sans journal', async () => {
    const { service, projects, images, actions } = setup(stored);
    await service.remove('mon-projet', owner, 'img1', undefined);
    expect(images.remove).toHaveBeenCalled();
    const [, patch] = projects.update.mock.calls[0] as unknown as [
      unknown,
      { customization: { gallery: unknown[] } },
    ];
    expect(patch.customization.gallery).toEqual([]);
    expect(actions.save).not.toHaveBeenCalled();
  });

  it('un tiers non admin : 403', async () => {
    const { service, images } = setup(stored);
    expect(
      await status(service.remove('mon-projet', coOwner, 'img1', undefined)),
    ).toBe(403);
    expect(images.remove).not.toHaveBeenCalled();
  });

  it('image inconnue : 404', async () => {
    const { service } = setup(stored);
    expect(
      await status(service.remove('mon-projet', owner, 'nope', undefined)),
    ).toBe(404);
  });

  it('R-S4 : un admin sur le projet d autrui est journalise et le porteur prevenu', async () => {
    const { service, actions, notifications } = setup(stored);
    await service.remove('mon-projet', admin, 'img1', 'contenu inapproprie');
    expect(actions.save).toHaveBeenCalledWith(
      expect.objectContaining({
        adminId: 'admin',
        type: 'remove_project_media',
        targetType: 'project',
        targetId: 'p1',
        reason: 'contenu inapproprie',
      }),
    );
    expect(notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: 'owner',
        actorId: 'admin',
        type: 'admin_decision',
      }),
    );
  });
});

describe('CustomizationService.adminMedia', () => {
  it('liste banniere et galerie, galerie vide si rien', async () => {
    const { service } = setup();
    expect(await service.adminMedia('mon-projet')).toEqual({ gallery: [] });
  });

  it('projet inconnu : 404', async () => {
    const { service } = setup();
    expect(await status(service.adminMedia('absent'))).toBe(404);
  });
});
