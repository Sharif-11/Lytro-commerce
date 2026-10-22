import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BRAND_FONTS,
  BRAND_TEXT_COLORS,
  STATUS_TEXT_COLORS,
  BrandFont,
  BrandPair,
  DEFAULT_BRAND,
  brandContrast,
  contrastRatio,
  derivedBrandColors,
  featureOn,
  nearestShade,
  saveBrandSchema,
  textColorOn,
  type BrandColors,
} from '../src/index';

// BRN-02, BRN-03, BRN-04, BRN-05: the brand identity's shared rules -- the contrast check the editor and the server
// both run, its suggestions, the curated fonts, and whether a shop has the feature.
const LYTRO: BrandColors = {
  mainColor: DEFAULT_BRAND.mainColor,
  accentColor: DEFAULT_BRAND.accentColor,
  backgroundColor: DEFAULT_BRAND.backgroundColor,
};

/** A colour role's value in one of packages/ui's stylesheets. */
function cssColor(file: string, role: string): string | undefined {
  const css = readFileSync(join(__dirname, '..', '..', 'ui', 'src', 'styles', file), 'utf8');
  return new RegExp(`--color-${role}:\\s*(#[0-9a-f]{6});`, 'i').exec(css)?.[1]?.toLowerCase();
}

function pairOf(colors: BrandColors, pair: BrandPair) {
  return brandContrast(colors).pairs.find((each) => each.pair === pair);
}

describe('the contrast check (BRN-03)', () => {
  it('measures as WCAG 2.1 does, and puts ink or white on a colour, whichever reads better', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBe(21);
    expect(contrastRatio('#0e6b66', '#0e6b66')).toBe(1);
    expect(textColorOn('#0e6b66')).toBe(BRAND_TEXT_COLORS.white);
    expect(textColorOn('#f2a516')).toBe(BRAND_TEXT_COLORS.ink);
  });

  it("checks against the dashboard's own ink and status colours (packages/ui)", () => {
    expect(cssColor('base.css', 'ink')).toBe(BRAND_TEXT_COLORS.ink);
    for (const [role, color] of Object.entries(STATUS_TEXT_COLORS)) {
      expect(cssColor('light.css', role)).toBe(color);
    }
  });

  it("passes Lytro's own identity on every pair", () => {
    const check = brandContrast(LYTRO);
    expect(check.passes).toBe(true);
    expect(check.pairs.map((each) => each.pair)).toEqual(Object.values(BrandPair));
    expect(check.suggestions).toEqual({});
  });

  it('refuses a pale yellow main colour with a darker shade that passes', () => {
    const pale = { ...LYTRO, mainColor: '#f8e58c' };
    const check = brandContrast(pale);
    expect(check.passes).toBe(false);
    expect(pairOf(pale, BrandPair.MainOnBackground)).toMatchObject({ passes: false, needs: 3 });
    const darker = check.suggestions.mainColor ?? '';
    expect(contrastRatio(darker, '#000000')).toBeLessThan(contrastRatio('#f8e58c', '#000000'));
    expect(brandContrast({ ...pale, mainColor: darker }).passes).toBe(true);
  });

  it('refuses a colour neither ink nor white can be read on, and suggests the nearest that can', () => {
    const muddy = { ...LYTRO, accentColor: '#d9534f' };
    const check = brandContrast(muddy);
    const pair = pairOf(muddy, BrandPair.TextOnAccent);
    expect(pair).toMatchObject({ passes: false, needs: 4.5 });
    // Rounded down: a failing pair never shows the ratio it needs.
    expect(pair?.ratio).toBe(4.24);
    expect(Object.keys(check.suggestions)).toEqual(['accentColor']);
    expect(check.suggestions.accentColor).toMatch(/^#[0-9a-f]{6}$/);
    expect(brandContrast({ ...muddy, ...check.suggestions }).passes).toBe(true);
  });

  it('refuses a background the fixed status colours cannot be read on, even when ink can (BRN-04)', () => {
    const sand = { ...LYTRO, backgroundColor: '#eae4d0' };
    expect(pairOf(sand, BrandPair.TextOnBackground)?.passes).toBe(true);
    expect(pairOf(sand, BrandPair.StatusOnBackground)).toMatchObject({
      passes: false,
      ratio: 4.07,
    });
    const lighter = brandContrast(sand).suggestions.backgroundColor ?? '';
    expect(brandContrast({ ...sand, backgroundColor: lighter }).passes).toBe(true);
    // A cream the statuses still read on is a background a shop may have.
    expect(brandContrast({ ...LYTRO, backgroundColor: '#f6f4ee' }).passes).toBe(true);
  });

  it('keeps a colour that passes, and finds no shade when nothing could pass', () => {
    expect(nearestShade('#0E6B66', () => true)).toBe('#0e6b66');
    expect(nearestShade('#0e6b66', () => false)).toBeNull();
  });

  it('derives the text on each colour, and the main colour dark enough to be read as body text', () => {
    const derived = derivedBrandColors({ ...LYTRO, mainColor: '#17a89e' });
    expect(derived).toMatchObject({
      onMain: BRAND_TEXT_COLORS.ink,
      onAccent: BRAND_TEXT_COLORS.ink,
    });
    expect(derived.text).toBe(BRAND_TEXT_COLORS.ink);
    expect(contrastRatio('#17a89e', '#ffffff')).toBeLessThan(4.5);
    expect(contrastRatio(derived.mainText, '#ffffff')).toBeGreaterThanOrEqual(4.5);
    expect(derivedBrandColors(LYTRO).mainText).toBe(DEFAULT_BRAND.mainColor);
  });
});

describe('a saved identity (BRN-02)', () => {
  const identity = {
    mainColor: '#0E6B66',
    accentColor: '#f2a516',
    backgroundColor: '#FFFFFF',
    headingFont: BrandFont.GaladaPlayfairDisplay,
    bodyFont: BrandFont.HindSiliguriPlusJakartaSans,
    corners: 'round',
    spacing: 'airy',
    darkLogoId: null,
    iconId: null,
  };

  it('takes its colours in lower case, and a display typeface for headings', () => {
    const saved = saveBrandSchema.parse(identity);
    expect(saved).toMatchObject({ mainColor: '#0e6b66', backgroundColor: '#ffffff' });
    expect(BRAND_FONTS[saved.headingFont]).toMatchObject({ bangla: 'Galada', headingsOnly: true });
  });

  it('never sets body text in a typeface for headings only, nor takes a colour that is not one', () => {
    const display = saveBrandSchema.safeParse({
      ...identity,
      bodyFont: BrandFont.GaladaPlayfairDisplay,
    });
    expect(display.success).toBe(false);
    expect(display.error?.issues[0]?.path).toEqual(['bodyFont']);
    expect(saveBrandSchema.safeParse({ ...identity, mainColor: 'teal' }).success).toBe(false);
  });
});

describe('a plan feature (BRN-05)', () => {
  it('is on from the plan, or from an add-on held now', () => {
    expect(featureOn('brand_identity', { features: { brand_identity: true }, active: [] })).toBe(
      true,
    );
    expect(
      featureOn('brand_identity', { features: null, active: [{ key: 'brand_identity' }] }),
    ).toBe(true);
    expect(
      featureOn('brand_identity', {
        features: { brand_identity: false },
        active: [{ key: 'storage' }],
      }),
    ).toBe(false);
  });
});
