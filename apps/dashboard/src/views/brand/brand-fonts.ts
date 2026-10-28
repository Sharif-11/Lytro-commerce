import { useEffect } from 'react';
import { BRAND_FONTS_URL } from './brand-words';

const FONTS_LINK_ID = 'lytro-brand-fonts';

/** The curated faces, loaded once for the editor's samples and preview (Part 17); the policy allows Google Fonts. */
export function useBrandFonts(): void {
  useEffect(() => {
    if (document.getElementById(FONTS_LINK_ID)) return;
    const link = document.createElement('link');
    link.id = FONTS_LINK_ID;
    link.rel = 'stylesheet';
    link.href = BRAND_FONTS_URL;
    document.head.appendChild(link);
  }, []);
}
