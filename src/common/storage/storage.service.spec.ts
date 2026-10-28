import { describe, expect, it } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import { StorageService } from './storage.service.js';

const settings: Record<string, unknown> = {
  'storage.bucket': 'highfive',
  'storage.endpoint': 'http://minio:9000',
  'storage.publicEndpoint': 'http://localhost:9000',
  'storage.region': 'us-east-1',
  'storage.accessKeyId': 'cle',
  'storage.secretAccessKey': 'secret',
  'storage.forcePathStyle': true,
};

const storage = new StorageService({
  get: (key: string) => settings[key],
} as unknown as ConfigService);

const SIX_HOURS = 6 * 60 * 60;
const at = (iso: string) => new Date(iso);

describe('stableSignedUrlFor', () => {
  it('rend la meme URL tout au long de la fenetre', async () => {
    const first = await storage.stableSignedUrlFor(
      'customization/p/a.webp',
      SIX_HOURS,
      at('2026-10-28T06:00:01Z'),
    );
    const later = await storage.stableSignedUrlFor(
      'customization/p/a.webp',
      SIX_HOURS,
      at('2026-10-28T11:59:59Z'),
    );
    expect(later).toBe(first);
  });

  it('change de signature a la fenetre suivante', async () => {
    const before = await storage.stableSignedUrlFor(
      'customization/p/a.webp',
      SIX_HOURS,
      at('2026-10-28T11:59:59Z'),
    );
    const after = await storage.stableSignedUrlFor(
      'customization/p/a.webp',
      SIX_HOURS,
      at('2026-10-28T12:00:00Z'),
    );
    expect(after).not.toBe(before);
  });

  it('signe pour deux fenetres, sur l adresse publique', async () => {
    const url = new URL(
      await storage.stableSignedUrlFor(
        'customization/p/a.webp',
        SIX_HOURS,
        at('2026-10-28T08:30:00Z'),
      ),
    );
    expect(url.origin).toBe('http://localhost:9000');
    expect(url.pathname).toBe('/highfive/customization/p/a.webp');
    expect(url.searchParams.get('X-Amz-Date')).toBe('20261028T060000Z');
    expect(url.searchParams.get('X-Amz-Expires')).toBe(String(2 * SIX_HOURS));
  });
});

describe('removePrefix', () => {
  /** Client S3 simule : deux pages de liste, puis la suppression. */
  const withClient = (
    pages: { keys: string[]; next?: string }[],
    deleteErrors: unknown[] = [],
  ) => {
    const service = new StorageService({
      get: (key: string) => settings[key],
    } as unknown as ConfigService);
    const sent: { name: string; input: Record<string, unknown> }[] = [];
    let page = 0;
    const send = (command: {
      constructor: { name: string };
      input: Record<string, unknown>;
    }) => {
      sent.push({ name: command.constructor.name, input: command.input });
      if (command.constructor.name === 'ListObjectsV2Command') {
        const current = pages[page++];
        return Promise.resolve({
          Contents: current.keys.map((Key) => ({ Key })),
          IsTruncated: !!current.next,
          NextContinuationToken: current.next,
        });
      }
      return Promise.resolve({ Errors: deleteErrors });
    };
    (service as unknown as { client: { send: typeof send } }).client = {
      send,
    };
    return { service, sent };
  };

  it('parcourt toutes les pages et supprime par lot', async () => {
    const { service, sent } = withClient([
      { keys: ['projects/p/a', 'projects/p/b'], next: 'suite' },
      { keys: ['projects/p/c'] },
    ]);
    expect(await service.removePrefix('projects/p')).toBe(3);
    const lists = sent.filter((c) => c.name === 'ListObjectsV2Command');
    expect(lists.map((c) => c.input.Prefix)).toEqual([
      'projects/p/',
      'projects/p/',
    ]);
    expect(lists[1].input.ContinuationToken).toBe('suite');
    expect(sent.filter((c) => c.name === 'DeleteObjectsCommand')).toHaveLength(
      2,
    );
  });

  it("n'envoie aucune suppression pour un prefixe vide", async () => {
    const { service, sent } = withClient([{ keys: [] }]);
    expect(await service.removePrefix('avatars/u/')).toBe(0);
    expect(sent.map((c) => c.name)).toEqual(['ListObjectsV2Command']);
  });

  it('leve si un objet resiste', async () => {
    const { service } = withClient(
      [{ keys: ['customization/p/a.webp'] }],
      [{ Key: 'customization/p/a.webp', Code: 'AccessDenied' }],
    );
    await expect(service.removePrefix('customization/p')).rejects.toThrow(
      /non supprime/,
    );
  });
});
