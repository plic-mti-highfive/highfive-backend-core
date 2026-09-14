import { ApiError } from '../errors/api-error.js';

export interface UploadedFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/**
 * R-F2 : le type reel du contenu prime sur l'extension et sur le
 * `Content-Type` annonce par le client, tous deux choisis par l'appelant.
 *
 * On lit la signature des premiers octets pour les familles qui en ont une
 * stable. Ce n'est pas une analyse antivirus : c'est ce qui empeche de
 * deposer un executable en le nommant `.png`.
 */
const MAGIC: { bytes: number[]; mime: string }[] = [
  { bytes: [0x89, 0x50, 0x4e, 0x47], mime: 'image/png' },
  { bytes: [0xff, 0xd8, 0xff], mime: 'image/jpeg' },
  { bytes: [0x47, 0x49, 0x46, 0x38], mime: 'image/gif' },
  { bytes: [0x25, 0x50, 0x44, 0x46], mime: 'application/pdf' },
  { bytes: [0x50, 0x4b, 0x03, 0x04], mime: 'application/zip' },
  { bytes: [0x1f, 0x8b], mime: 'application/gzip' },
  { bytes: [0x37, 0x7a, 0xbc, 0xaf], mime: 'application/x-7z-compressed' },
  { bytes: [0x49, 0x44, 0x33], mime: 'audio/mpeg' },
  { bytes: [0x4f, 0x67, 0x67, 0x53], mime: 'audio/ogg' },
];

/** Signatures d'executables : refusees quel que soit le type annonce. */
const FORBIDDEN_MAGIC: { bytes: number[]; label: string }[] = [
  { bytes: [0x4d, 0x5a], label: 'executable Windows' },
  { bytes: [0x7f, 0x45, 0x4c, 0x46], label: 'executable Linux' },
  { bytes: [0xcf, 0xfa, 0xed, 0xfe], label: 'executable macOS' },
  { bytes: [0x23, 0x21], label: 'script shell' },
];

const startsWith = (buffer: Buffer, bytes: number[]): boolean =>
  bytes.every((byte, index) => buffer[index] === byte);

export function detectMimeType(file: UploadedFile): string {
  for (const forbidden of FORBIDDEN_MAGIC) {
    if (startsWith(file.buffer, forbidden.bytes)) {
      throw ApiError.validation(
        `Ce fichier est un ${forbidden.label} : ce type n'est pas accepte.`,
      );
    }
  }

  const detected = MAGIC.find((entry) => startsWith(file.buffer, entry.bytes));
  // `webp`, `svg` et quelques formats audio n'ont pas de signature dans cette
  // table : on retombe sur le type annonce, qui sera confronte a la liste
  // blanche juste apres.
  return detected?.mime ?? file.mimetype;
}

export function assertAllowed(
  mimeType: string,
  allowedPrefixes: string[],
  allowedTypes: string[],
): void {
  const allowed =
    allowedPrefixes.some((prefix) => mimeType.startsWith(prefix)) ||
    allowedTypes.includes(mimeType);

  if (!allowed) {
    throw ApiError.validation(
      'Ce type de fichier ne peut pas etre depose (images, PDF, audio et archives seulement).',
    );
  }
}

export function assertSize(size: number, maxBytes: number): void {
  if (size > maxBytes) {
    throw ApiError.validation(
      `Ce fichier depasse ${Math.round(maxBytes / (1024 * 1024))} Mo.`,
    );
  }
}

export function requireFile(file: UploadedFile | undefined): UploadedFile {
  if (!file) throw ApiError.validation('Aucun fichier recu.');
  return file;
}
