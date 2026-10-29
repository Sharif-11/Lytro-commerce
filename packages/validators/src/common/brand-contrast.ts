import { BrandPair } from '../db/enums';
import type { BrandColors } from './brand';

// BRN-03: the two text colours a brand identity's text is derived from -- Lytro's ink and white (packages/ui base.css,
// --color-ink).
export const BRAND_TEXT_COLORS = { ink: '#10201f', white: '#ffffff' } as const;

// BRN-04: the status colours no identity changes, as text (packages/ui light.css, --color-success, --color-warning and
// --color-danger). A background must keep each of them readable.
export const STATUS_TEXT_COLORS = {
  success: '#1b7a43',
  warning: '#9a6004',
  danger: '#c8323b',
} as const;

// WCAG 2.1 AA: body text needs 4.5:1; large text and what is not text (an icon, the main colour as a heading) 3:1.
export const CONTRAST_TEXT = 4.5;
export const CONTRAST_LARGE = 3;

// How far a suggested shade is moved toward black or white at each step.
const SHADE_STEP = 0.01;

/**
 * BRN-03: the colour that answers for each pair -- the one a failing pair's suggestion changes, and the one whose field
 * a refusal names. The main colour answers for its pair with the background too; the background for the status colours.
 */
export const BRAND_PAIR_COLOR: Readonly<Record<BrandPair, keyof BrandColors>> = {
  [BrandPair.TextOnMain]: 'mainColor',
  [BrandPair.MainOnBackground]: 'mainColor',
  [BrandPair.TextOnAccent]: 'accentColor',
  [BrandPair.TextOnBackground]: 'backgroundColor',
  [BrandPair.StatusOnBackground]: 'backgroundColor',
};

/** BRN-03: one checked pair, its ratio (rounded down, so a failing pair never shows the ratio it needs). */
export interface BrandContrastPair {
  pair: BrandPair;
  ratio: number;
  needs: number;
  passes: boolean;
}

/** BRN-03: every pair, and for each colour in a failing pair the nearest shade of it that passes all of its own. */
export interface BrandContrast {
  passes: boolean;
  pairs: BrandContrastPair[];
  suggestions: Partial<BrandColors>;
}

/** BRN-03: the colours a page takes from the three chosen -- the text on each, and the main colour as body text. */
export interface DerivedBrandColors {
  onMain: string;
  onAccent: string;
  text: string;
  /** The main colour, made dark (or light) enough to be read as body text and links on the background. */
  mainText: string;
}

function channels(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function hexOf([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

/** WCAG 2.1's relative luminance of an sRGB colour. */
function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((channel) => {
    const share = channel / 255;
    return share <= 0.04045 ? share / 12.92 : ((share + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}

/** WCAG 2.1's contrast ratio of two colours, 1 to 21. */
export function contrastRatio(first: string, second: string): number {
  const [light, dark] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
}

/** BRN-03: the text colour that reads best on this colour -- ink or white. */
export function textColorOn(background: string): string {
  const { ink, white } = BRAND_TEXT_COLORS;
  return contrastRatio(white, background) > contrastRatio(ink, background) ? white : ink;
}

/**
 * A colour mixed toward black (0) or white (255) by a share, channel by channel: the shades a check suggests and the
 * tints a theme draws from one chosen colour (BRN-03, BRN-07).
 */
export function mixColor(hex: string, toward: 0 | 255, share: number): string {
  const [r, g, b] = channels(hex).map((channel) =>
    Math.round(channel + (toward - channel) * share),
  );
  return hexOf([r ?? 0, g ?? 0, b ?? 0]);
}

/**
 * BRN-03: the nearest shade of a colour that passes -- the colour itself when it does, else the least mix of it toward
 * black or toward white that does (darker first when both reach it at the same step). Null when neither does.
 */
export function nearestShade(hex: string, passes: (shade: string) => boolean): string | null {
  const color = hex.toLowerCase();
  if (passes(color)) return color;
  for (let step = 1; step * SHADE_STEP <= 1; step += 1) {
    const share = step * SHADE_STEP;
    for (const toward of [0, 255] as const) {
      const shade = mixColor(color, toward, share);
      if (passes(shade)) return shade;
    }
  }
  return null;
}

function reads(text: string, on: string, needs: number): boolean {
  return contrastRatio(text, on) >= needs;
}

function statusRatio(background: string): number {
  return Math.min(
    ...Object.values(STATUS_TEXT_COLORS).map((status) => contrastRatio(status, background)),
  );
}

/** BRN-03: the text derived for a colour reaches body-text contrast on it. */
function carriesText(color: string): boolean {
  return reads(textColorOn(color), color, CONTRAST_TEXT);
}

/** BRN-03, BRN-04: a background its text and the fixed status colours can be read on. */
function holdsText(background: string): boolean {
  return carriesText(background) && statusRatio(background) >= CONTRAST_TEXT;
}

/**
 * BRN-03, BRN-04: checks a brand identity's colours -- the text derived for the main colour, the accent and the
 * background; the main colour against the background; the fixed status colours on the background -- and suggests,
 * for each colour in a failing pair, its nearest shade that passes. The main colour answers for its pair with the
 * background.
 */
export function brandContrast(colors: BrandColors): BrandContrast {
  const { mainColor: main, accentColor: accent, backgroundColor: background } = colors;
  const pair = (name: BrandPair, ratio: number, needs: number): BrandContrastPair => ({
    pair: name,
    ratio: Math.floor(ratio * 100) / 100,
    needs,
    passes: ratio >= needs,
  });
  const pairs = [
    pair(BrandPair.TextOnMain, contrastRatio(textColorOn(main), main), CONTRAST_TEXT),
    pair(BrandPair.TextOnAccent, contrastRatio(textColorOn(accent), accent), CONTRAST_TEXT),
    pair(
      BrandPair.TextOnBackground,
      contrastRatio(textColorOn(background), background),
      CONTRAST_TEXT,
    ),
    pair(BrandPair.MainOnBackground, contrastRatio(main, background), CONTRAST_LARGE),
    pair(BrandPair.StatusOnBackground, statusRatio(background), CONTRAST_TEXT),
  ];
  const failing = new Set(pairs.filter((each) => !each.passes).map((each) => each.pair));
  const suggestions: Partial<BrandColors> = {};
  if (failing.has(BrandPair.TextOnMain) || failing.has(BrandPair.MainOnBackground)) {
    const shade = nearestShade(
      main,
      (color) => carriesText(color) && reads(color, background, CONTRAST_LARGE),
    );
    if (shade) suggestions.mainColor = shade;
  }
  if (failing.has(BrandPair.TextOnAccent)) {
    const shade = nearestShade(accent, carriesText);
    if (shade) suggestions.accentColor = shade;
  }
  if (failing.has(BrandPair.TextOnBackground) || failing.has(BrandPair.StatusOnBackground)) {
    const shade = nearestShade(background, holdsText);
    if (shade) suggestions.backgroundColor = shade;
  }
  return { passes: failing.size === 0, pairs, suggestions };
}

/** BRN-03: the text on each chosen colour, and the main colour readable as body text on the background. */
export function derivedBrandColors(colors: BrandColors): DerivedBrandColors {
  const { mainColor: main, accentColor: accent, backgroundColor: background } = colors;
  return {
    onMain: textColorOn(main),
    onAccent: textColorOn(accent),
    text: textColorOn(background),
    mainText:
      nearestShade(main, (color) => reads(color, background, CONTRAST_TEXT)) ??
      textColorOn(background),
  };
}
