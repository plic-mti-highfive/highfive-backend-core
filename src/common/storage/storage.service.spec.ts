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
