import { join } from 'node:path';
import { Inject, Injectable } from '@nestjs/common';
import sharp from 'sharp';
import { MONOGRAM_COLORS } from '@lytronix/shared-types';
import { SHOP_ICON_FONTS } from '../tokens';
import { ShopIconFile } from '../types/shop-app';

/** Each icon's size, the share of it the logo or the letter may fill, and whether a phone masks it to a shape. */
const ICONS: Record<ShopIconFile, { size: number; fill: number; maskable: boolean }> = {
  [ShopIconFile.Icon192]: { size: 192, fill: 0.8, maskable: false },
  [ShopIconFile.Icon512]: { size: 512, fill: 0.8, maskable: false },
  // Android crops a maskable icon to a shape inside the middle 80% circle; a square inside it fits in 56%.
  [ShopIconFile.Maskable512]: { size: 512, fill: 0.56, maskable: true },
  [ShopIconFile.Apple180]: { size: 180, fill: 0.8, maskable: false },
  [ShopIconFile.Store192]: { size: 192, fill: 0.8, maskable: false },
  [ShopIconFile.Store512]: { size: 512, fill: 0.8, maskable: false },
  [ShopIconFile.StoreMaskable512]: { size: 512, fill: 0.56, maskable: true },
  [ShopIconFile.StoreApple180]: { size: 180, fill: 0.8, maskable: false },
};

// Slice 12c (prototype Part 27): the dashboard app's gear, a white disc in the icon's corner -- a third of an icon,
// its centre near the corner; a fifth of a maskable one, its centre where the whole disc stays inside the middle 80%
// circle a phone keeps.
const GEAR = { share: 0.34, centre: 0.79 };
const MASKABLE_GEAR = { share: 0.2, centre: 0.71 };
// The prototype's settings icon (lucide's), drawn in ink on the disc.
const GEAR_PATH =
  'M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z';

// A monogram letter fills less of its tile than a logo, the way the Install card draws it.
const LETTER_SHARE = 0.62;

// BRN-02: a brand's square icon is drawn to be an app icon; inside a maskable icon it keeps most of the tile, so only its
// very corners fall to the phone's mask.
const MASKABLE_ICON_FILL = 0.8;

const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };

/** A colour all four corners of the logo share closely enough to fill the icon around it with. */
type Rgba = typeof WHITE;

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
    return this.centred(logo, size, fill);
  }

  /** BRN-02: the brand identity's square icon -- edge to edge, or most of a maskable icon on its own colour. */
  async fromIcon(icon: Buffer, file: ShopIconFile): Promise<Buffer> {
    const { size, maskable } = ICONS[file];
    if (maskable) return this.centred(icon, size, MASKABLE_ICON_FILL);
    return sharp(icon).resize(size, size, { fit: 'cover' }).png().toBuffer();
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

  /** TEN-17, Slice 12c: an icon with the dashboard app's gear in its corner (inside the safe circle when maskable). */
  async withGear(icon: Buffer, file: ShopIconFile): Promise<Buffer> {
    const { size, maskable } = ICONS[file];
    const { share, centre } = maskable ? MASKABLE_GEAR : GEAR;
    const disc = Math.round(size * share);
    const radius = disc / 2;
    const glyph = disc * 0.62;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${String(disc)}" height="${String(disc)}">
      <circle cx="${String(radius)}" cy="${String(radius)}" r="${String(radius - 1)}" fill="#ffffff"
        stroke="${MONOGRAM_COLORS.tile}" stroke-opacity="0.12" stroke-width="2"/>
      <g transform="translate(${String(radius - glyph / 2)},${String(radius - glyph / 2)}) scale(${String(glyph / 24)})"
        fill="none" stroke="${MONOGRAM_COLORS.tile}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="${GEAR_PATH}"/><circle cx="12" cy="12" r="3"/>
      </g>
    </svg>`;
    const at = Math.round(size * centre - radius);
    return sharp(icon)
      .composite([{ input: Buffer.from(svg), left: at, top: at }])
      .png()
      .toBuffer();
  }

  /** An image fitted inside a share of the tile, on the image's own background colour. */
  private async centred(image: Buffer, size: number, fill: number): Promise<Buffer> {
    const background = await this.edgeColour(image);
    const inner = Math.round(size * fill);
    const fitted = await sharp(image)
      .resize(inner, inner, { fit: 'contain', background })
      .png()
      .toBuffer();
    return sharp({ create: { width: size, height: size, channels: 4, background } })
      .composite([{ input: fitted, gravity: 'center' }])
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
