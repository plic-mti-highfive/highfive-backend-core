import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { makeThumbnail } from './thumbnail.js';

const image = (width: number, height: number, format: 'png' | 'avif') =>
  sharp({
    create: { width, height, channels: 3, background: '#3a7f6b' },
  })
    [format]()
    .toBuffer();

describe('makeThumbnail', () => {
  it('reduit une banniere a 640 px de large, en WebP, sans deformer', async () => {
    const thumb = await makeThumbnail(await image(1600, 533, 'png'), 640);
    const meta = await sharp(thumb).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.width).toBe(640);
    expect(meta.height).toBe(213);
  });

  it('accepte un AVIF', async () => {
    const thumb = await makeThumbnail(await image(1200, 800, 'avif'), 640);
    expect((await sharp(thumb).metadata()).width).toBe(640);
  });

  it("n'agrandit pas une petite image", async () => {
    const thumb = await makeThumbnail(await image(300, 200, 'png'), 640);
    expect((await sharp(thumb).metadata()).width).toBe(300);
  });

  it('refuse un contenu qui ne se decode pas', async () => {
    // Signature PNG suivie de rien d'exploitable.
    const fake = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    await expect(makeThumbnail(fake, 640)).rejects.toMatchObject({
      status: 400,
    });
  });

  it('refuse une image demesuree avant de la decoder', async () => {
    // 10 000 x 5 000 = 50 millions de pixels, au-dela du plafond.
    const huge = await sharp({
      create: { width: 10_000, height: 5_000, channels: 3, background: '#000' },
    })
      .png({ compressionLevel: 9 })
      .toBuffer();
    await expect(makeThumbnail(huge, 640)).rejects.toMatchObject({
      status: 400,
    });
  });
});
