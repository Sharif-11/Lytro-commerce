import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { cookies } from 'next/headers';
import { ServiceWorker } from '@/components/service-worker';
import { iconPath, themeColor } from '@/lib/app/app-manifest';
import { LANGUAGE_COOKIE, parseLanguage } from '@/lib/i18n/words';
import { loadShopPage } from '@/lib/storefront';
import './fonts.css';
import './storefront.css';
import './storefront-live.css';

// SFT-01: one app for every shop; the host names the shop, so each page reads it and sets its own title and tags. For
// an open shop, the frame adds the tab's icon and the iPhone's (BRN-02, Slice 12c) and, while its storefront is on, the
// app manifest (SFT-14); a closed shop's page names no shop (LIF-07), so it has neither.
export async function generateMetadata(): Promise<Metadata> {
  const base: Metadata = { title: 'Lytro', robots: { index: true, follow: true } };
  const page = await loadShopPage();
  if (page.state !== 'open') return base;
  return {
    ...base,
    icons: {
      icon: [{ url: iconPath(page.info, 'store-192.png'), sizes: '192x192', type: 'image/png' }],
      apple: [{ url: iconPath(page.info, 'store-apple-180.png'), sizes: '180x180' }],
    },
    manifest: page.shop.storefrontEnabled ? '/manifest.webmanifest' : undefined,
  };
}

/** The phone's bar in the shop's main colour while its identity shows, else Lytro's (BRN-02). */
export async function generateViewport(): Promise<Viewport> {
  const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' };
  const page = await loadShopPage();
  return page.state === 'open' ? { ...viewport, themeColor: themeColor(page.info) } : viewport;
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const language = parseLanguage((await cookies()).get(LANGUAGE_COOKIE)?.value);
  const page = await loadShopPage();
  return (
    <html lang={language}>
      <body>
        {children}
        {page.state === 'open' && page.shop.storefrontEnabled ? <ServiceWorker /> : null}
      </body>
    </html>
  );
}
