import {
  BRAND_FONTS,
  BRAND_PAIR_COLOR,
  BrandCorners,
  BrandFont,
  BrandPair,
  DEFAULT_BRAND,
  STATUS_TEXT_COLORS,
  textColorOn,
  type BrandColors,
  type BrandContrast,
  type BrandContrastPair,
  type BrandFontPair,
  type SaveBrandInput,
} from '@lytronix/validators';
import type { BrandEditor, BrandIdentity } from '@/types/brand';

/**
 * Where the shop stands with its identity (BRN-02, BRN-05; prototype Part 23): on with the add-on, on with a plan that
 * includes it, off, on the trial, without the add-on, or switched on but not showing since the add-on lapsed. The
 * server's `allowed` decides; the trial and the add-on only name why it is not.
 */
export type BrandState = 'on' | 'plan' | 'off' | 'trial' | 'noaddon' | 'lapsed';

export function brandState(
  editor: Pick<BrandEditor, 'useBrand' | 'allowed'>,
  trial: boolean,
  hasAddon: boolean,
): BrandState {
  if (editor.allowed) return editor.useBrand ? (hasAddon ? 'on' : 'plan') : 'off';
  if (trial) return 'trial';
  return editor.useBrand ? 'lapsed' : 'noaddon';
}

/** The identity shows to everyone in these states. */
export function isOn(state: BrandState): boolean {
  return state === 'on' || state === 'plan';
}

/** BRN-03: a ratio as the page writes it -- rounded down to one decimal, so a failing pair never shows what it needs. */
export function ratioText(ratio: number): string {
  return `${(Math.floor(Math.round(ratio * 1000) / 100) / 10).toFixed(1)}:1`;
}

// The three pairs the page always lists; the main colour on the background and the status colours on it are listed
// only when they fail (Part 23).
const ALWAYS: readonly BrandPair[] = [
  BrandPair.TextOnMain,
  BrandPair.TextOnAccent,
  BrandPair.TextOnBackground,
];

export function pairsShown(contrast: BrandContrast): BrandContrastPair[] {
  return contrast.pairs.filter((each) => ALWAYS.includes(each.pair) || !each.passes);
}

/** The pairs a colour answers for, in the check's order: what its sheet lists. */
export function pairsOfColour(
  colour: keyof BrandColors,
  contrast: BrandContrast,
): BrandContrastPair[] {
  return contrast.pairs.filter((each) => BRAND_PAIR_COLOR[each.pair] === colour);
}

/** The nearest shade that passes for a failing pair's colour, when the check found one. */
export function suggestionFor(pair: BrandContrastPair, contrast: BrandContrast): string | null {
  if (pair.passes) return null;
  return contrast.suggestions[BRAND_PAIR_COLOR[pair.pair]] ?? null;
}

/** The "Aa" a pair is shown with: its text colour on its colour (BRN-03's derived text, BRN-04's fixed red). */
export function pairSample(pair: BrandPair, colours: BrandColors): { text: string; on: string } {
  const { mainColor: main, accentColor: accent, backgroundColor: background } = colours;
  switch (pair) {
    case BrandPair.TextOnMain:
      return { text: textColorOn(main), on: main };
    case BrandPair.TextOnAccent:
      return { text: textColorOn(accent), on: accent };
    case BrandPair.TextOnBackground:
      return { text: textColorOn(background), on: background };
    case BrandPair.MainOnBackground:
      return { text: main, on: background };
    case BrandPair.StatusOnBackground:
      return { text: STATUS_TEXT_COLORS.danger, on: background };
  }
}

/** Each pair's words on the page, and in a colour's sheet, where it is named from that colour's side. */
export const PAIR_WORDS: Readonly<Record<BrandPair, { page: string; sheet: string }>> = {
  [BrandPair.TextOnMain]: { page: 'brPairMain', sheet: 'brTextOnIt' },
  [BrandPair.TextOnAccent]: { page: 'brPairAccent', sheet: 'brTextOnIt' },
  [BrandPair.TextOnBackground]: { page: 'brPairBg', sheet: 'brTextOnIt' },
  [BrandPair.MainOnBackground]: { page: 'brPairMainBg', sheet: 'brOnBg' },
  [BrandPair.StatusOnBackground]: { page: 'brPairStatus', sheet: 'brStatusOnIt' },
};

/** The three colours in the page's order, each with its words: its swatch's label, its sheet's title and hint. */
export const COLOURS: readonly {
  colour: keyof BrandColors;
  label: string;
  title: string;
  hint: string;
}[] = [
  { colour: 'mainColor', label: 'brMain', title: 'brColMain', hint: 'brColMainHint' },
  { colour: 'accentColor', label: 'brAccent', title: 'brColAccent', hint: 'brColAccentHint' },
  { colour: 'backgroundColor', label: 'brBg', title: 'brColBg', hint: 'brColBgHint' },
];

/** The colours a sheet offers (Part 23), each passing with Lytro's default others. */
export const BRAND_PALETTES: Readonly<Record<keyof BrandColors, readonly string[]>> = {
  mainColor: [
    '#0f6e6a',
    '#1d4ed8',
    '#6b2d6b',
    '#8a1c2b',
    '#1b5e3a',
    '#2b2b2b',
    '#7a4a1f',
    '#c8323b',
  ],
  accentColor: ['#f2a93b', '#f26b4f', '#e8508a', '#38a3d1', '#8cc63f', '#f5c518'],
  backgroundColor: ['#ffffff', '#f6f4ee', '#fbf7ef', '#f2f6f5', '#fdf3f4', '#f4f1fa'],
};

/** A colour as a field takes it: #rrggbb, in lower case. */
export function colourOf(typed: string): string | null {
  const value = typed.trim().toLowerCase();
  const full = value.startsWith('#') ? value : `#${value}`;
  return /^#[0-9a-f]{6}$/.test(full) ? full : null;
}

// A pair's faces as a font stack (Part 17): one definition, shared with the storefront (Slice 12c).
export { fontStack } from '@lytronix/validators';

// Part 17's samples: the same in both languages, since the point is to see both faces.
export const FONT_SAMPLES = {
  heading: ['ঈদের নতুন কালেকশন', 'The new Eid collection'],
  body: [
    'ঢাকায় 2 দিনে ডেলিভারি, ক্যাশ অন ডেলিভারিতেও।',
    'Delivered in Dhaka in 2 days, cash on delivery too.',
  ],
} as const;

/** A pair's names, Lytro's own marked (Part 17). */
export function fontName(font: BrandFont, lytros: string): string {
  const pair = BRAND_FONTS[font];
  return `${pair.bangla} + ${pair.latin}${font === DEFAULT_BRAND.bodyFont ? ` · ${lytros}` : ''}`;
}

/** The pairs a font sheet lists, Lytro's first; body text leaves out the pairs for headings only (BRN-02). */
export function fontChoices(kind: 'heading' | 'body'): BrandFontPair[] {
  return Object.values(BRAND_FONTS).filter((pair) => kind === 'heading' || !pair.headingsOnly);
}

/**
 * The curated faces from Google Fonts, at the weights the editor sets them in, less what the app serves itself
 * (styles/fonts.css: Inter 400 to 600, Noto Sans Bengali, Plus Jakarta Sans 700 and 800). A face with one weight
 * (Galada, Tiro Bangla) is asked for alone.
 */
export const BRAND_FONTS_URL =
  'https://fonts.googleapis.com/css2?family=Anek+Bangla:wght@400;700&family=Baloo+Da+2:wght@400;700' +
  '&family=DM+Sans:wght@400;700&family=Fraunces:wght@400;700&family=Galada&family=Hind+Siliguri:wght@400;700' +
  '&family=Inter:wght@700&family=Lora:wght@400;700&family=Noto+Serif+Bengali:wght@400;700' +
  '&family=Playfair+Display:wght@400;700&family=Plus+Jakarta+Sans:wght@400&family=Poppins:wght@400;700' +
  '&family=Tiro+Bangla&display=swap';

/** BRN-06: the preview's corner radius for each preset, in px, as the prototype draws them. */
export const PREVIEW_RADIUS: Readonly<Record<BrandCorners, number>> = {
  [BrandCorners.Square]: 3,
  [BrandCorners.Soft]: 10,
  [BrandCorners.Round]: 16,
};

/** Whether the page's identity is the one saved: its tokens and its two images. */
export function sameIdentity(saved: BrandIdentity, form: BrandIdentity): boolean {
  return (
    saved.mainColor === form.mainColor &&
    saved.accentColor === form.accentColor &&
    saved.backgroundColor === form.backgroundColor &&
    saved.headingFont === form.headingFont &&
    saved.bodyFont === form.bodyFont &&
    saved.corners === form.corners &&
    saved.spacing === form.spacing &&
    (saved.darkLogo?.id ?? null) === (form.darkLogo?.id ?? null) &&
    (saved.icon?.id ?? null) === (form.icon?.id ?? null)
  );
}

/** PUT /brand's body: the identity whole; `useBrand: true` is Apply, left out the switch stays as it is. */
export function saveInput(form: BrandIdentity, useBrand?: boolean): SaveBrandInput {
  return {
    mainColor: form.mainColor,
    accentColor: form.accentColor,
    backgroundColor: form.backgroundColor,
    headingFont: form.headingFont,
    bodyFont: form.bodyFont,
    corners: form.corners,
    spacing: form.spacing,
    darkLogoId: form.darkLogo?.id ?? null,
    iconId: form.icon?.id ?? null,
    ...(useBrand === undefined ? {} : { useBrand }),
  };
}
