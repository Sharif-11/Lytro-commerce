import { useEffect } from 'react';
import { CONTRAST_TEXT, contrastRatio, mixColor, nearestShade } from '@lytronix/validators';
import type { LiveBrand } from '@/types/me';
import { useBrandFonts } from '@/views/brand/brand-fonts';
import { fontStack } from '@/views/brand/brand-words';
import { pointIcons, pointThemeColor } from './head-tags';

const WHITE = '#ffffff';
/** Lytro's own rail (brand-900): a shop's rail is its main colour taken down to this depth, so white reads at ~12:1. */
const LYTRO_RAIL = '#063b38';

/**
 * BRN-02, BRN-07 (Slice 11.12b, TENANT-DASHBOARD-DESIGN §7.28, prototype Part 24): the CSS variables a shop's identity
 * sets on the dashboard -- the main colour's scale with the rail at Lytro's depth, the accent's scale, the page behind
 * the cards, and the two faces. The corners and spacing are presets `light.css` holds, chosen by the document's
 * `data-corners` and `data-spacing`; the status colours are not drawn from these (BRN-04).
 */
export function brandVariables(brand: LiveBrand): Record<string, string> {
  const { main, accent, background, onMain, onAccent, mainText } = brand.colors;
  const palest = mixColor(main, 255, 0.94);
  const pale = mixColor(main, 255, 0.88);
  const rail =
    nearestShade(
      main,
      (shade) => contrastRatio(WHITE, shade) >= contrastRatio(WHITE, LYTRO_RAIL),
    ) ?? main;
  // Words in the main colour read at 4.5:1 on the page and on the pale tint an avatar is (so on the palest, a
  // selected item, too), a little more than the server's mainText asks, which reads on the page alone.
  const words =
    nearestShade(main, (shade) =>
      [background, pale].every((under) => contrastRatio(shade, under) >= CONTRAST_TEXT),
    ) ?? mainText;
  const accentText =
    nearestShade(accent, (shade) => contrastRatio(shade, WHITE) >= CONTRAST_TEXT) ?? accent;
  return {
    '--color-brand-50': palest,
    '--color-brand-100': pale,
    '--color-brand-200': mixColor(main, 255, 0.75),
    '--color-brand-300': mixColor(main, 255, 0.55),
    '--color-brand-500': mixColor(main, 255, 0.3),
    '--color-brand-700': main,
    '--color-brand-800': mixColor(main, 0, 0.2),
    '--color-brand-900': rail,
    '--color-rail-on': mixColor(rail, 255, 0.1),
    '--color-rail-text': mixColor(rail, 255, 0.82),
    '--color-on-primary': onMain,
    '--color-primary-text': words,
    '--color-accent-500': accent,
    '--color-accent-700': accentText,
    '--color-on-accent': onAccent,
    '--color-page': background,
    '--font-ui': fontStack(brand.fonts.body.id),
    '--font-brand-heading': fontStack(brand.fonts.heading.id),
  };
}

/**
 * BRN-02: while the shop's identity shows, the dashboard wears it -- its colours, faces, corners and spacing, the tab's
 * icon once the square icon is set, and the phone browser's bar in the main colour. Switched off, lapsed, or on leaving
 * the shop, Lytro's again. Another open dashboard takes a change at its next read of /me (design §7.28).
 */
export function useBrandTheme(brand: LiveBrand | null): void {
  useBrandFonts(brand !== null);
  useEffect(() => {
    if (!brand) return undefined;
    const root = document.documentElement;
    const variables = brandVariables(brand);
    for (const [name, value] of Object.entries(variables)) root.style.setProperty(name, value);
    root.setAttribute('data-brand', brand.version);
    root.setAttribute('data-corners', brand.corners);
    root.setAttribute('data-spacing', brand.spacing);
    const undoIcons = brand.icon ? pointIcons(brand.icon.urls.thumbnail) : null;
    const undoColor = pointThemeColor(brand.colors.main);
    return () => {
      for (const name of Object.keys(variables)) root.style.removeProperty(name);
      for (const attribute of ['data-brand', 'data-corners', 'data-spacing']) {
        root.removeAttribute(attribute);
      }
      undoIcons?.();
      undoColor();
    };
  }, [brand]);
}
