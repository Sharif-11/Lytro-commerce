import type { Metadata } from 'next';
import localFont from 'next/font/local';
import type { ReactNode } from 'react';
import { SiteEnvironment } from '@/lib/env';
import { requestLanguage } from '@/lib/i18n/read-language';
import './globals.css';

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

export const metadata: Metadata = {
  metadataBase: new URL(env.siteUrl),
  title: {
    default: 'Lytro — আপনার দোকান, আপনার হাতে',
    template: '%s · Lytro',
  },
  description:
    'বাংলাদেশি সেলারের জন্য আসল অনলাইন দোকান চালানোর সবচেয়ে সহজ উপায়: অর্ডার, বিকাশ-নগদ পেমেন্ট, কুরিয়ার বুকিং আর ফেক অর্ডার চেক, বাংলায়। ৩০ দিন ফ্রি, কার্ড লাগে না।',
  applicationName: 'Lytro',
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    siteName: 'Lytro',
    locale: 'bn_BD',
    alternateLocale: ['en_US'],
  },
  twitter: { card: 'summary_large_image' },
  robots: { index: true, follow: true },
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const language = await requestLanguage.read();
  return (
    <html
      lang={language}
      className={`${jakarta.variable} ${inter.variable} ${notoBengali.variable} ${notoLatin.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
