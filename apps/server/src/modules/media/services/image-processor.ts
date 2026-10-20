import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import sharp from 'sharp';
import { MediaRefused } from '../../../common/errors/media-refused';

// STO-04: the long edge of the stored image and of its thumbnail, and the WebP quality of both.
export const IMAGE_LONG_EDGE_PX = 1600;
export const THUMBNAIL_LONG_EDGE_PX = 300;
const WEBP_QUALITY = 80;
// A decompression bomb (a small file that decodes to an enormous picture) is refused before it is decoded. 50
// megapixels is above any phone camera's photo.
const MAX_INPUT_PIXELS = 50_000_000;
// STO-04, STO-06: the formats taken, judged by the file's content. SVG (which can carry script), GIF, HEIC and every
// other format sharp could read are refused.
const ACCEPTED_FORMATS: ReadonlySet<string> = new Set(['jpeg', 'png', 'webp']);

/** One stored picture: its WebP bytes and size. */
export interface ImageVariant {
  body: Buffer;
  width: number;
  height: number;
  bytes: number;
}

/** STO-04: what an accepted image is stored as. The uploaded file itself is not kept. */
export interface ProcessedImage {
  main: ImageVariant;
  thumbnail: ImageVariant;
  /** MED-08: a fingerprint of the stored picture, part of its public name, so a different picture gets a new link. */
  hash: string;
  /** What the upload was, by its content. */
  format: 'jpeg' | 'png' | 'webp';
}

function isAccepted(format: string | undefined): format is ProcessedImage['format'] {
  return format !== undefined && ACCEPTED_FORMATS.has(format);
}

/**
 * STO-04, STO-06: turns an uploaded image into what is stored. The file is judged by its content, never its name: a
 * JPEG, PNG or WebP within the size limit is turned upright from its camera's orientation tag, stripped of every hidden
 * detail it carried (location, camera), cut to a long edge of 1600 px (never enlarged) as WebP at quality 80, with a
 * 300 px thumbnail. Anything else is refused.
 */
@Injectable()
export class ImageProcessor {
  async process(input: Buffer, maxBytes: number): Promise<ProcessedImage> {
    if (input.length > maxBytes) throw new MediaRefused('too_large');
    let format: string | undefined;
    try {
      format = (await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS }).metadata()).format;
    } catch {
      throw new MediaRefused('not_supported');
    }
    if (!isAccepted(format)) throw new MediaRefused('not_supported');
    try {
      // `rotate()` with no angle applies the orientation tag; the WebP output carries no metadata unless asked to.
      const upright = sharp(input, { limitInputPixels: MAX_INPUT_PIXELS }).rotate();
      const [main, thumbnail] = await Promise.all([
        this.variant(upright.clone(), IMAGE_LONG_EDGE_PX),
        this.variant(upright.clone(), THUMBNAIL_LONG_EDGE_PX),
      ]);
      return {
        main,
        thumbnail,
        hash: createHash('sha256').update(main.body).digest('hex').slice(0, 32),
        format,
      };
    } catch {
      throw new MediaRefused('unreadable');
    }
  }

  private async variant(image: sharp.Sharp, longEdge: number): Promise<ImageVariant> {
    const { data, info } = await image
      .resize({ width: longEdge, height: longEdge, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer({ resolveWithObject: true });
    return { body: data, width: info.width, height: info.height, bytes: info.size };
  }
}
