import { createHash } from 'node:crypto';
import { LYTRO_APP_COLORS } from '@lytronix/shared-types';
import { shortNameOf } from '@lytronix/validators';
import type { PublicShop } from '../api/storefront-api';

// SFT-14, CCH-10 (Slice 12c): the storefront installs as the shop's own app -- its plain name and icon, the dashboard's
// app being the one marked "Admin" (TEN-17) -- scoped to the whole storefront, in the shop's colours.

/** The icons the server draws for the storefront's app (the plain ones), as the storefront serves them. */
export const STORE_ICON_FILES = [
  'store-192.png',
  'store-512.png',
  'store-maskable-512.png',
  'store-apple-180.png',
] as const;
export type StoreIconFile = (typeof STORE_ICON_FILES)[number];

export function isStoreIconFile(file: string): file is StoreIconFile {
  return (STORE_ICON_FILES as readonly string[]).includes(file);
}

export interface StorefrontManifest {
  id: string;
  name: string;
  short_name: string;
  start_url: string;
  scope: string;
  display: 'standalone';
  lang: string;
  theme_color: string;
  background_color: string;
  icons: { src: string; sizes: string; type: 'image/png'; purpose: 'any' | 'maskable' }[];
}

/** What the app's icons show -- the name, the logo, the brand -- as a short fingerprint for their links, so a change
    gives new icons at once. */
export function iconVersion(shop: PublicShop): string {
  return createHash('sha256')
    .update(`${shop.name}\u0000${shop.logo?.id ?? ''}\u0000${shop.brand?.version ?? ''}`)
    .digest('hex')
    .slice(0, 12);
}

/** An icon's link on the storefront, with its version. */
export function iconPath(shop: PublicShop, file: StoreIconFile): string {
  return `/icons/${file}?v=${iconVersion(shop)}`;
}

/** The theme colour a phone's bar and the app take: the shop's main colour while its identity shows, else Lytro's. */
export function themeColor(shop: PublicShop): string {
  return shop.brand?.colors.main ?? LYTRO_APP_COLORS.theme;
}

export function storefrontManifest(shop: PublicShop): StorefrontManifest {
  return {
    id: '/',
    name: shop.name,
    short_name: shortNameOf(shop.name),
    start_url: '/',
    scope: '/',
    display: 'standalone',
    lang: 'bn',
    theme_color: themeColor(shop),
    background_color: shop.brand?.colors.background ?? LYTRO_APP_COLORS.background,
    icons: [
      { src: iconPath(shop, 'store-192.png'), sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: iconPath(shop, 'store-512.png'), sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: iconPath(shop, 'store-maskable-512.png'),
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
