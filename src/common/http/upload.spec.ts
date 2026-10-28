import { describe, expect, it } from 'vitest';
import {
  assertAllowed,
  assertSize,
  detectMimeType,
  requireFile,
  type UploadedFile,
} from './upload.js';

const file = (bytes: number[], mimetype = 'image/png'): UploadedFile => ({
  originalname: 'fichier.png',
  mimetype,
  size: bytes.length,
  buffer: Buffer.from(bytes),
});

describe('detectMimeType', () => {
  it('reconnait un PNG a sa signature', () => {
    expect(detectMimeType(file([0x89, 0x50, 0x4e, 0x47]))).toBe('image/png');
  });

  it('prime sur le type annonce par le client', () => {
    // Un PDF renomme en .png et annonce image/png reste un PDF.
    expect(detectMimeType(file([0x25, 0x50, 0x44, 0x46]))).toBe(
      'application/pdf',
    );
  });

  it('refuse un executable meme deguise en image', () => {
    expect(() => detectMimeType(file([0x4d, 0x5a, 0x90, 0x00]))).toThrow();
    expect(() => detectMimeType(file([0x7f, 0x45, 0x4c, 0x46]))).toThrow();
  });

  const isoBmff = (brand: string) => [
    ...[0x00, 0x00, 0x00, 0x18],
    ...Buffer.from(`ftyp${brand}`, 'latin1'),
  ];

  it('reconnait les videos a leur conteneur, pas a leur nom', () => {
    expect(detectMimeType(file(isoBmff('isom'), 'image/png'))).toBe(
      'video/mp4',
    );
    expect(detectMimeType(file(isoBmff('qt  ')))).toBe('video/quicktime');
    expect(detectMimeType(file([0x1a, 0x45, 0xdf, 0xa3]))).toBe('video/webm');
  });

  it('distingue les autres membres de la famille MP4', () => {
    expect(detectMimeType(file(isoBmff('heic')))).toBe('image/heic');
    expect(detectMimeType(file(isoBmff('M4A ')))).toBe('audio/mp4');
  });

  it('reconnait un AVIF, y compris annonce en marque compatible', () => {
    expect(detectMimeType(file(isoBmff('avif'), 'video/mp4'))).toBe(
      'image/avif',
    );
    // Boite `ftyp` complete : `mif1` en principale, `avif` en compatible.
    const mif1 = [
      ...[0x00, 0x00, 0x00, 0x1c],
      ...Buffer.from('ftypmif1', 'latin1'),
      ...[0x00, 0x00, 0x00, 0x00],
      ...Buffer.from('mif1avifmiaf', 'latin1'),
    ];
    expect(detectMimeType(file(mif1))).toBe('image/avif');
  });

  it('ne lit pas de marque compatible au-dela de la boite ftyp', () => {
    // La boite s'arrete apres la marque principale : `avif` qui suit n'en
    // fait pas partie.
    const short = [
      ...[0x00, 0x00, 0x00, 0x10],
      ...Buffer.from('ftypisom', 'latin1'),
      ...[0x00, 0x00, 0x00, 0x00],
      ...Buffer.from('avif', 'latin1'),
    ];
    expect(detectMimeType(file(short))).toBe('video/mp4');
  });

  it('reconnait un WebP a son conteneur RIFF', () => {
    const riff = (format: string) => [
      ...Buffer.from('RIFF', 'latin1'),
      ...[0x24, 0x00, 0x00, 0x00],
      ...Buffer.from(format, 'latin1'),
    ];
    expect(detectMimeType(file(riff('WEBP'), 'image/png'))).toBe('image/webp');
    // Un WAV garde le type annonce, comme avant.
    expect(detectMimeType(file(riff('WAVE'), 'audio/wav'))).toBe('audio/wav');
  });

  it('retombe sur le type annonce pour les formats sans signature connue', () => {
    expect(
      detectMimeType(file([0x3c, 0x73, 0x76, 0x67], 'image/svg+xml')),
    ).toBe('image/svg+xml');
  });
});

describe('liste blanche', () => {
  it('accepte par prefixe de famille', () => {
    expect(() => assertAllowed('image/webp', ['image/'], [])).not.toThrow();
  });

  it('accepte un type explicitement liste', () => {
    expect(() =>
      assertAllowed('application/pdf', ['image/'], ['application/pdf']),
    ).not.toThrow();
  });

  it('refuse tout le reste', () => {
    expect(() =>
      assertAllowed('application/x-msdownload', ['image/'], []),
    ).toThrow();
  });
});

describe('garde-fous', () => {
  it('refuse un fichier trop gros', () => {
    expect(() => assertSize(21 * 1024 * 1024, 20 * 1024 * 1024)).toThrow();
    expect(() => assertSize(1024, 20 * 1024 * 1024)).not.toThrow();
  });

  it('refuse une requete sans fichier', () => {
    expect(() => requireFile(undefined)).toThrow();
  });
});

describe('detectMimeType : formats image du site', () => {
  const riff = (format: string) => [
    ...Buffer.from('RIFF', 'latin1'),
    0x24,
    0x00,
    0x00,
    0x00,
    ...Buffer.from(`${format}VP8 `, 'latin1'),
  ];
  const ftyp = (brand: string) => [
    0x00,
    0x00,
    0x00,
    0x1c,
    ...Buffer.from(`ftyp${brand}`, 'latin1'),
  ];

  it('reconnait un WebP a son en-tete RIFF/WEBP', () => {
    expect(detectMimeType(file(riff('WEBP'), 'application/octet-stream'))).toBe(
      'image/webp',
    );
  });

  it('un RIFF qui n est pas du WebP (WAV, AVI) n est pas pris pour une image', () => {
    expect(detectMimeType(file(riff('WAVE'), 'image/webp'))).not.toBe(
      'image/webp',
    );
  });

  it('reconnait un AVIF a sa marque ftyp, pas un MP4', () => {
    expect(detectMimeType(file(ftyp('avif'), 'video/mp4'))).toBe('image/avif');
    expect(detectMimeType(file(ftyp('avis'), 'video/mp4'))).toBe('image/avif');
  });
});
