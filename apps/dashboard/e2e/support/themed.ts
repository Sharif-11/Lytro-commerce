import { BrandCorners, BrandFont, BrandSpacing } from '@lytronix/validators';
import { drawnBrand, type BrandFixture } from './brand';

// Prototype Part 24's two identities (Slice 11.12b, TENANT-DASHBOARD-DESIGN §7.28), switched on and allowed, so a
// screen with `brandShows` wears one as the prototype's `themed-*` screens do.

/** The logo for dark backgrounds the maroon identity sets: the shop's name in white, as the rail's foot draws it. */
const DARK_LOGO = `data:image/svg+xml;utf8,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='112' height='40' viewBox='0 0 112 40'>" +
    "<text x='56' y='29' text-anchor='middle' font-family='Georgia, serif' font-weight='700' font-size='30' " +
    "fill='#ffffff'>megh</text></svg>",
)}`;

/** Maroon on cream, Noto Serif Bengali + Fraunces headings, Hind Siliguri + Plus Jakarta Sans body, round, airy. */
export function maroonBrand(): BrandFixture {
  return {
    ...drawnBrand(),
    identity: {
      mainColor: '#7a1f2b',
      accentColor: '#f2a516',
      backgroundColor: '#fbf7f0',
      headingFont: BrandFont.NotoSerifBengaliFraunces,
      bodyFont: BrandFont.HindSiliguriPlusJakartaSans,
      corners: BrandCorners.Round,
      spacing: BrandSpacing.Airy,
      darkLogo: { id: 'm-dark-logo', urls: { main: DARK_LOGO, thumbnail: DARK_LOGO } },
      icon: null,
    },
  };
}

/** Indigo with coral on a cool white, Baloo Da 2 + Poppins headings, Anek Bangla + DM Sans body, square, compact. */
export function indigoBrand(): BrandFixture {
  return {
    ...drawnBrand(),
    identity: {
      mainColor: '#3b3fbf',
      accentColor: '#ff7a59',
      backgroundColor: '#f3f5fb',
      headingFont: BrandFont.BalooDa2Poppins,
      bodyFont: BrandFont.AnekBanglaDmSans,
      corners: BrandCorners.Square,
      spacing: BrandSpacing.Compact,
      darkLogo: null,
      icon: null,
    },
  };
}
