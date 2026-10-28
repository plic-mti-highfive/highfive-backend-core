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
  // EBML : WebM (et Matroska, meme conteneur).
  { bytes: [0x1a, 0x45, 0xdf, 0xa3], mime: 'video/webm' },
];

/**
 * Famille ISO BMFF (MP4, MOV, HEIC, AVIF, M4A) : pas de signature en tete,
 * mais `ftyp` au decalage 4, suivi d'une marque principale puis des marques
 * compatibles, qui disent ce que contient la boite. Une marque inconnue est
 * traitee en MP4, de loin le plus courant.
 *
 * L'ordre compte : un AVIF annonce souvent `mif1` (conteneur d'images
 * generique, aussi celui du HEIC) en marque principale et `avif` parmi les
 * compatibles — sans les lire, il passerait pour du HEIC, ou pour une video
 * avec la seule marque principale.
 */
const FTYP_BRANDS: { brands: string[]; mime: string }[] = [
  { brands: ['avif', 'avis'], mime: 'image/avif' },
  { brands: ['qt  '], mime: 'video/quicktime' },
  { brands: ['heic', 'heix', 'mif1', 'msf1'], mime: 'image/heic' },
  { brands: ['M4A ', 'M4B '], mime: 'audio/mp4' },
];

function detectIsoBmff(buffer: Buffer): string | undefined {
  if (buffer.length < 12 || buffer.toString('latin1', 4, 8) !== 'ftyp') {
    return undefined;
  }
  const boxEnd = Math.min(buffer.readUInt32BE(0), buffer.length);
  const brands = [buffer.toString('latin1', 8, 12)];
  // Apres la marque principale : 4 octets de version, puis les compatibles.
  for (let offset = 16; offset + 4 <= boxEnd; offset += 4) {
    brands.push(buffer.toString('latin1', offset, offset + 4));
  }
  return (
    FTYP_BRANDS.find((entry) =>
      entry.brands.some((brand) => brands.includes(brand)),
    )?.mime ?? 'video/mp4'
  );
}

/**
 * Conteneur RIFF (WebP, WAV, AVI) : la signature seule ne dit rien, le format
 * est aux octets 8..12. Un RIFF qui n'est pas du WebP ne doit pas passer pour
 * une image sur la foi du type annonce.
 */
const RIFF_FORMATS: Record<string, string> = {
  WEBP: 'image/webp',
  WAVE: 'audio/wav',
  'AVI ': 'video/x-msvideo',
};

function detectRiff(buffer: Buffer): string | undefined {
  if (buffer.length < 12 || buffer.toString('latin1', 0, 4) !== 'RIFF') {
    return undefined;
  }
  return (
    RIFF_FORMATS[buffer.toString('latin1', 8, 12)] ?? 'application/octet-stream'
  );
}

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

  const detected =
    MAGIC.find((entry) => startsWith(file.buffer, entry.bytes))?.mime ??
    detectIsoBmff(file.buffer) ??
    detectRiff(file.buffer);
  // `svg` et quelques formats audio n'ont pas de signature reconnue ici : on
  // retombe sur le type annonce, qui sera confronte a la liste blanche juste
  // apres.
  return detected ?? file.mimetype;
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
