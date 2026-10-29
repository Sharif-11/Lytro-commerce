import { cookies, headers } from 'next/headers';
import { cache } from 'react';
import { AREA_COOKIE, parseArea } from './area';
import { ServerApi } from './api/server-api';
import {
  type PublicCategory,
  type PublicShop,
  type ShopperRequest,
  StorefrontApi,
  type StorefrontShopContext,
} from './api/storefront-api';
import { StorefrontEnvironment } from './env';
import { LANGUAGE_COOKIE, parseLanguage, Words } from './i18n/words';

// Server-only: what every page reads first. The shopper's host names the shop (TEN-08); its state decides whether the
// page shows the shop, the generic offline page (SFT-12, LIF-07) or not-found.

const env = StorefrontEnvironment.shared();
export const storefrontApi = new StorefrontApi(new ServerApi(env.serverUrl), env);

/** The shopper's request as the server should see it: the host without a port, their address, their language. */
export class ShopperRequests {
  constructor(private readonly settings: StorefrontEnvironment) {}

  async read(): Promise<ShopperRequest> {
    const [incoming, jar] = await Promise.all([headers(), cookies()]);
    return {
      host: ShopperRequests.hostOf(incoming.get('host')),
      clientAddress: ShopperRequests.blankToNull(incoming.get(this.settings.clientIpHeader)),
      language: parseLanguage(jar.get(LANGUAGE_COOKIE)?.value),
    };
  }

  static hostOf(value: string | null): string {
    return (value ?? '').trim().toLowerCase().replace(/:\d+$/, '');
  }

  static blankToNull(value: string | null): string | null {
    const trimmed = value?.trim();
    return trimmed && trimmed.length > 0 ? trimmed : null;
  }
}

const shoppers = new ShopperRequests(env);

export type ShopPage =
  | {
      state: 'open';
      shop: StorefrontShopContext;
      info: PublicShop;
      shopper: ShopperRequest;
      words: Words;
    }
  | { state: 'closed'; words: Words }
  | { state: 'missing'; words: Words };

export type OpenShopPage = Extract<ShopPage, { state: 'open' }>;

/** The shop this request is for, read once per request however many parts of the page ask. */
export const loadShopPage = cache(async (): Promise<ShopPage> => {
  const shopper = await shoppers.read();
  const words = new Words(shopper.language);
  const context = await storefrontApi.context(shopper.host);
  if (context.outcome === 'closed') return { state: 'closed', words };
  if (context.outcome !== 'open' || !context.shop) return { state: 'missing', words };
  const info = await storefrontApi.shop(context.shop, shopper);
  return { state: 'open', shop: context.shop, info, shopper, words };
});

/** A product by its link, read once per request (the page and its preview tags share it). */
export const loadProduct = cache(async (slug: string) => {
  const page = await loadShopPage();
  if (page.state !== 'open') return null;
  return storefrontApi.product(page.shop, page.shopper, slug);
});

/** What every storefront page's frame shows besides the shop: its categories (kept a minute per shop, Slice 12b) and
    the shopper's remembered area for the cart (SFT-20). */
export interface PageFrame {
  categories: PublicCategory[];
  areaId: number | null;
}

export async function loadFrame(page: OpenShopPage): Promise<PageFrame> {
  const [categories, jar] = await Promise.all([
    storefrontApi.categories(page.shop, page.shopper),
    cookies(),
  ]);
  return { categories, areaId: parseArea(jar.get(AREA_COOKIE)?.value) };
}
