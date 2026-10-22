import { join } from 'node:path';
import { Inject, Injectable } from '@nestjs/common';
import sharp from 'sharp';
import { MONOGRAM_COLORS } from '@lytronix/shared-types';
import { SHOP_ICON_FONTS } from '../tokens';
import { ShopIconFile } from '../types/shop-app';

/** Each icon's size, and the share of it the logo or the letter may fill. */
const ICONS: Record<ShopIconFile, { size: number; fill: number }> = {
  [ShopIconFile.Icon192]: { size: 192, fill: 0.8 },
  [ShopIconFile.Icon512]: { size: 512, fill: 0.8 },
  // Android crops a maskable icon to a shape inside the middle 80% circle; a square inside it fits in 56%.
  [ShopIconFile.Maskable512]: { size: 512, fill: 0.56 },
  [ShopIconFile.Apple180]: { size: 180, fill: 0.8 },
};

// A monogram letter fills less of its tile than a logo, the way the Install card draws it.
const LETTER_SHARE = 0.62;

const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };

/** A colour all four corners of the logo share closely enough to fill the icon around it with. */
type Rgba = typeof WHITE;

/** TEN-16: a shop's monogram letter -- the first letter of its name (a Bangla letter alone, without its signs). */
export function monogramLetter(shopName: string, fallback: string): string {
  const letter = Array.from(shopName).find((character) => /[\p{L}\p{N}]/u.test(character));
  return (letter ?? fallback.charAt(0)).toLocaleUpperCase('en');
}

/**
 * TEN-17: the icons an installed shop app shows -- its logo on a square, or its monogram on an ink tile -- drawn as
 * PNGs. A logo with a solid background is set on that colour, so the icon reads as one piece; a transparent one on
 * white. The letter is drawn from the server's own fonts (assets/fonts), never the machine's.
 */
@Injectable()
export class ShopIcons {
  constructor(@Inject(SHOP_ICON_FONTS) private readonly fontsDir: string) {}

  async fromLogo(logo: Buffer, file: ShopIconFile): Promise<Buffer> {
    const { size, fill } = ICONS[file];
    const background = await this.edgeColour(logo);
    const inner = Math.round(size * fill);
    const fitted = await sharp(logo)
      .resize(inner, inner, { fit: 'contain', background })
      .png()
      .toBuffer();
    return sharp({ create: { width: size, height: size, channels: 4, background } })
      .composite([{ input: fitted, gravity: 'center' }])
      .png()
      .toBuffer();
  }

  async fromLetter(letter: string, file: ShopIconFile): Promise<Buffer> {
    const { size, fill } = ICONS[file];
    const box = Math.round(size * fill * LETTER_SHARE);
    const bangla = /\p{Script=Bengali}/u.test(letter);
    const glyph = await sharp({
      text: {
        text: `<span foreground="${MONOGRAM_COLORS.letter}">${letter}</span>`,
        font: `${bangla ? 'Noto Sans Bengali' : 'Inter'} Bold`,
        fontfile: join(
          this.fontsDir,
          bangla ? 'noto-sans-bengali-bengali-wght-normal.woff2' : 'inter-latin-wght-normal.woff2',
        ),
        rgba: true,
        width: box,
        height: box,
      },
    })
      .png()
      .toBuffer();
    return sharp({
      create: { width: size, height: size, channels: 4, background: MONOGRAM_COLORS.tile },
    })
      .composite([{ input: glyph, gravity: 'center' }])
      .png()
      .toBuffer();
  }

  /** The logo's own background: its four corners' colour when they are opaque and alike, white otherwise. */
  private async edgeColour(logo: Buffer): Promise<Rgba> {
    const { data, info } = await sharp(logo)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const corners = [
      [0, 0],
      [info.width - 1, 0],
      [0, info.height - 1],
      [info.width - 1, info.height - 1],
    ].map(([x = 0, y = 0]) => {
      const at = (y * info.width + x) * 4;
      return [data[at] ?? 0, data[at + 1] ?? 0, data[at + 2] ?? 0, data[at + 3] ?? 0];
    });
    if (corners.some((pixel) => (pixel[3] ?? 0) < 250)) return WHITE;
    const channel = (index: number): number[] => corners.map((pixel) => pixel[index] ?? 0);
    const alike = [0, 1, 2].every(
      (index) => Math.max(...channel(index)) - Math.min(...channel(index)) <= 24,
    );
    if (!alike) return WHITE;
    const mean = (index: number): number =>
      Math.round(channel(index).reduce((sum, value) => sum + value, 0) / corners.length);
    return { r: mean(0), g: mean(1), b: mean(2), alpha: 1 };
  }
}
