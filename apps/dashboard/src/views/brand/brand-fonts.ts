import { useEffect } from 'react';
import { BRAND_FONTS_URL } from './brand-words';

const FONTS_LINK_ID = 'lytro-brand-fonts';

/**
 * The curated faces, loaded once for the editor's samples and preview (Part 17) and for a shop whose identity shows
 * (Slice 11.12b); the policy allows Google Fonts. A face is fetched only once a page uses it.
 */
export function useBrandFonts(enabled = true): void {
  useEffect(() => {
    if (!enabled || document.getElementById(FONTS_LINK_ID)) return;
    const link = document.createElement('link');
    link.id = FONTS_LINK_ID;
    link.rel = 'stylesheet';
    link.href = BRAND_FONTS_URL;
    document.head.appendChild(link);
  }, [enabled]);
}
