import type { Metadata } from 'next';
import localFont from 'next/font/local';
import type { ReactNode } from 'react';
import { LytroPixel } from '@/components/analytics/lytro-pixel';
import { SiteEnvironment } from '@/lib/env';
import { requestLanguage } from '@/lib/i18n/read-language';
import { fullTitle, pageMetadata, SITE_NAME, SITE_PAGES } from '@/lib/seo/site-pages';
import './globals.css';
// After globals.css: the sketch's look (site.css), whose unlayered rules sit above Tailwind's base layer.
import './site.css';

// BRAND-IDENTITY.md §5: Plus Jakarta Sans for the wordmark and English headlines, Inter for UI and digits,
// Noto Sans Bengali for Bangla. The files are in the repo (src/fonts, with their licences), so neither the build nor
// the page ever waits on a third-party host. Each is a variable font, covering every weight in one file.
const jakarta = localFont({
  src: '../fonts/plus-jakarta-sans-latin-wght-normal.woff2',
  weight: '200 800',
  variable: '--font-jakarta',
  display: 'swap',
});
const inter = localFont({
  src: '../fonts/inter-latin-wght-normal.woff2',
  weight: '100 900',
  variable: '--font-inter',
  display: 'swap',
});
const notoBengali = localFont({
  src: '../fonts/noto-sans-bengali-bengali-wght-normal.woff2',
  weight: '100 900',
  variable: '--font-noto-bengali',
  display: 'swap',
});
// Noto Sans Bengali's own Latin letters, for English words and digits inside Bangla text (globals.css --font-bn).
// A file of its own, since a local font cannot give each file its own range of characters.
const notoLatin = localFont({
  src: '../fonts/noto-sans-bengali-latin-wght-normal.woff2',
  weight: '100 900',
  variable: '--font-noto-latin',
  display: 'swap',
});

const env = SiteEnvironment.current();

// The home page's words stand for any page that names none (a 404); every page names its own (lib/seo/site-pages.ts).
export const metadata: Metadata = {
  metadataBase: new URL(env.siteUrl),
  ...pageMetadata('home'),
  title: { default: fullTitle(SITE_PAGES.home), template: `%s · ${SITE_NAME}` },
  applicationName: SITE_NAME,
  robots: { index: true, follow: true },
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const language = await requestLanguage.read();
  return (
    <html
      lang={language}
      className={`${jakarta.variable} ${inter.variable} ${notoBengali.variable} ${notoLatin.variable}`}
    >
      <body>
        {children}
        {/* MKT-01: Lytro's own Meta pixel, only where website.env names it (production). */}
        {env.metaPixelId !== undefined ? <LytroPixel pixelId={env.metaPixelId} /> : null}
      </body>
    </html>
  );
}
