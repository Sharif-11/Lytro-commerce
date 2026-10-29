import { describe, expect, it } from 'vitest';
import {
  BrandCorners,
  BrandFont,
  BrandPair,
  BrandSpacing,
  DEFAULT_BRAND,
  brandContrast,
  saveBrandSchema,
  type BrandColors,
} from '@lytronix/validators';
import type { BrandIdentity } from '../src/types/brand';
import {
  BRAND_PALETTES,
  brandState,
  colourOf,
  fontChoices,
  fontName,
  fontStack,
  isOn,
  pairsOfColour,
  pairsShown,
  ratioText,
  sameIdentity,
  saveInput,
  suggestionFor,
} from '../src/views/brand/brand-words';

// The prototype's identity (Part 23): teal and marigold on sand.
const DRAWN: BrandColors = {
  mainColor: '#0f6e6a',
  accentColor: '#f2a93b',
  backgroundColor: '#f6f4ee',
};

const IDENTITY: BrandIdentity = {
  ...DRAWN,
  headingFont: BrandFont.TiroBanglaLora,
  bodyFont: BrandFont.NotoSansBengaliInter,
  corners: BrandCorners.Soft,
  spacing: BrandSpacing.Comfortable,
  darkLogo: null,
  icon: null,
};

describe('where the shop stands with its identity (BRN-02, BRN-05)', () => {
  it('is on with the add-on or the plan, off, or names why it cannot be switched on', () => {
    expect(brandState({ useBrand: true, allowed: true }, false, true)).toBe('on');
    expect(brandState({ useBrand: true, allowed: true }, false, false)).toBe('plan');
    expect(brandState({ useBrand: false, allowed: true }, false, true)).toBe('off');
    expect(brandState({ useBrand: false, allowed: false }, true, false)).toBe('trial');
    expect(brandState({ useBrand: false, allowed: false }, false, false)).toBe('noaddon');
    expect(brandState({ useBrand: true, allowed: false }, false, false)).toBe('lapsed');
    expect(isOn('plan')).toBe(true);
    expect(isOn('lapsed')).toBe(false);
  });
});

describe('the contrast check as the page shows it (BRN-03)', () => {
  it('writes a ratio rounded down to one decimal', () => {
    expect(ratioText(6.07)).toBe('6.0:1');
    expect(ratioText(15.29)).toBe('15.2:1');
    expect(ratioText(2.3)).toBe('2.3:1');
    expect(ratioText(4.5)).toBe('4.5:1');
    expect(ratioText(1.35)).toBe('1.3:1');
  });

  it('lists three pairs, and the main colour or the status colours on the background only when they fail', () => {
    expect(pairsShown(brandContrast(DRAWN)).map((each) => each.pair)).toEqual([
      BrandPair.TextOnMain,
      BrandPair.TextOnAccent,
      BrandPair.TextOnBackground,
    ]);
    const pale = brandContrast({ ...DRAWN, mainColor: '#f2d16b' });
    expect(pairsShown(pale).map((each) => each.pair)).toContain(BrandPair.MainOnBackground);
    const kraft = brandContrast({ ...DRAWN, backgroundColor: '#c9c2b0' });
    expect(pairsShown(kraft).map((each) => each.pair)).toContain(BrandPair.StatusOnBackground);
  });

  it("offers a failing pair its colour's nearest passing shade", () => {
    const pale = brandContrast({ ...DRAWN, mainColor: '#f2d16b' });
    const failing = pale.pairs.find((each) => each.pair === BrandPair.MainOnBackground);
    expect(failing && suggestionFor(failing, pale)).toBe('#a08a47');
    const passing = pale.pairs.find((each) => each.pair === BrandPair.TextOnAccent);
    expect(passing && suggestionFor(passing, pale)).toBeNull();
  });

  it("gives a colour's sheet the pairs that colour answers for", () => {
    const check = brandContrast(DRAWN);
    expect(pairsOfColour('mainColor', check).map((each) => each.pair)).toEqual([
      BrandPair.TextOnMain,
      BrandPair.MainOnBackground,
    ]);
    expect(pairsOfColour('backgroundColor', check).map((each) => each.pair)).toEqual([
      BrandPair.TextOnBackground,
      BrandPair.StatusOnBackground,
    ]);
  });

  it("offers only colours that pass with Lytro's default others", () => {
    const lytro: BrandColors = {
      mainColor: DEFAULT_BRAND.mainColor,
      accentColor: DEFAULT_BRAND.accentColor,
      backgroundColor: DEFAULT_BRAND.backgroundColor,
    };
    for (const [colour, choices] of Object.entries(BRAND_PALETTES)) {
      for (const choice of choices) {
        expect(brandContrast({ ...lytro, [colour]: choice }).passes, `${colour} ${choice}`).toBe(
          true,
        );
      }
    }
  });

  it('takes a colour code with or without its hash, in any case, and nothing else', () => {
    expect(colourOf('#0F6E6A')).toBe('#0f6e6a');
    expect(colourOf(' 0f6e6a ')).toBe('#0f6e6a');
    expect(colourOf('#0f6e6')).toBeNull();
    expect(colourOf('teal')).toBeNull();
  });
});

describe('the fonts (BRN-02, Part 17)', () => {
  it("lists seven pairs for headings, Lytro's first, and six for body text", () => {
    const headings = fontChoices('heading');
    expect(headings).toHaveLength(7);
    expect(headings[0]?.id).toBe(BrandFont.NotoSansBengaliInter);
    expect(fontChoices('body').map((each) => each.id)).not.toContain(
      BrandFont.GaladaPlayfairDisplay,
    );
  });

  it('sets the Latin face first, so Bangla letters fall through to the Bangla face', () => {
    expect(fontStack(BrandFont.TiroBanglaLora)).toBe("'Lora', 'Tiro Bangla', serif");
    expect(fontStack(BrandFont.NotoSansBengaliInter)).toBe(
      "'Inter', 'Noto Sans Bengali', sans-serif",
    );
    expect(fontName(BrandFont.NotoSansBengaliInter, 'default')).toBe(
      'Noto Sans Bengali + Inter · default',
    );
    expect(fontName(BrandFont.TiroBanglaLora, 'default')).toBe('Tiro Bangla + Lora');
  });
});

describe('saving (BRN-02)', () => {
  it('knows the page from what was saved, its images by id', () => {
    expect(sameIdentity(IDENTITY, { ...IDENTITY })).toBe(true);
    expect(sameIdentity(IDENTITY, { ...IDENTITY, spacing: BrandSpacing.Airy })).toBe(false);
    const icon = { id: 'm-icon', urls: { main: 'a', thumbnail: 'b' } };
    expect(sameIdentity({ ...IDENTITY, icon }, { ...IDENTITY, icon: { ...icon } })).toBe(true);
    expect(sameIdentity(IDENTITY, { ...IDENTITY, icon })).toBe(false);
  });

  it('sends the identity whole, Apply with the switch, a save without it', () => {
    const plain = saveInput({
      ...IDENTITY,
      icon: { id: 'm-icon', urls: { main: '', thumbnail: '' } },
    });
    expect(plain).not.toHaveProperty('useBrand');
    expect(plain).toMatchObject({ darkLogoId: null, iconId: 'm-icon', corners: 'soft' });
    expect(saveInput(IDENTITY, true).useBrand).toBe(true);
    // What the page sends is what the server's own request rules take.
    expect(saveBrandSchema.safeParse(saveInput(IDENTITY, true)).success).toBe(true);
  });
});
