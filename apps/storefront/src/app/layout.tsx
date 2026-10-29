import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { cookies } from 'next/headers';
import { LANGUAGE_COOKIE, parseLanguage } from '@/lib/i18n/words';
import './fonts.css';
import './storefront.css';
import './storefront-live.css';

// SFT-01: one app for every shop; the host names the shop, so each page reads it and sets its own title and tags.
export const metadata: Metadata = {
  title: 'Lytro',
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const language = parseLanguage((await cookies()).get(LANGUAGE_COOKIE)?.value);
  return (
    <html lang={language}>
      <body>{children}</body>
    </html>
  );
}
