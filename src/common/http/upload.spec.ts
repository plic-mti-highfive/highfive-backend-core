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
