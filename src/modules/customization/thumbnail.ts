import sharp from 'sharp';
import { ApiError } from '../../common/errors/api-error.js';

/**
 * Une image de 2 Mo peut se decompresser en plusieurs gigaoctets (images
 * « bombes »). 40 millions de pixels couvrent largement une banniere de
 * 1600 px ou une photo de 6000 x 6000, et bornent la memoire du decodage.
 */
const MAX_INPUT_PIXELS = 40_000_000;

/**
 * Variante WebP servie aux cartes de projet (SPEC : environ 640 px de large
 * plutot que la banniere complete, un fil en affiche douze ou plus).
 *
 * Decoder l'image entiere verifie aussi son contenu au-dela de la signature
 * lue par `detectMimeType` : un fichier qui commence comme un PNG mais ne se
 * decode pas est refuse ici.
 */
export async function makeThumbnail(
  source: Buffer,
  width: number,
): Promise<Buffer> {
  try {
    return await sharp(source, { limitInputPixels: MAX_INPUT_PIXELS })
      // Applique l'orientation EXIF : sans cela, une photo de telephone non
      // recompressee par le client s'afficherait couchee sur les cartes.
      .rotate()
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
  } catch {
    throw ApiError.validation(
      'Cette image est illisible ou trop grande pour etre traitee.',
    );
  }
}
