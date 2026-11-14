import { cookies, headers } from 'next/headers';
import { permanentRedirect } from 'next/navigation';
import { cache } from 'react';
import { SHOPPER_COOKIE } from './account/shopper-cookie';
import { AREA_COOKIE, parseArea } from './area';
import { ServerApi } from './api/server-api';
import {
  type PublicCategory,
  type PublicShop,
  type ShopperAddress,
  type ShopperOrderPage,
  type ShopperRequest,
  type ShopperView,
  StorefrontApi,
  type StorefrontShopContext,
} from './api/storefront-api';
import { StorefrontEnvironment } from './env';
import { LANGUAGE_COOKIE, parseLanguage, Words } from './i18n/words';
import { mainAddressTarget, STOREFRONT_PATH_HEADER, STOREFRONT_QUERY_HEADER } from './request-path';

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
      /** D9-14 (Slice 9.9): orders can't be placed for a few minutes, as the server said when the shop was named. */
      savingPaused: boolean;
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
  return {
    state: 'open',
    shop: context.shop,
    info,
    shopper,
    words,
    savingPaused: context.savingPaused === true,
  };
});

/**
 * Slice 13 (its read, point 3): a shop whose own domain serves answers there only. Its Lytro address and the domain's
 * twin lead to the same page on the domain, permanently (308), landing pages included.
 */
export async function leadToMainAddress(page: ShopPage): Promise<void> {
  if (page.state !== 'open') return;
  const incoming = await headers();
  const target = mainAddressTarget(
    page.shopper.host,
    page.shop,
    incoming.get(STOREFRONT_PATH_HEADER) ?? '/',
    incoming.get(STOREFRONT_QUERY_HEADER) ?? '',
  );
  if (target !== null) permanentRedirect(target);
}

/** A product by its link, read once per request (the page and its preview tags share it). */
export const loadProduct = cache(async (slug: string) => {
  const page = await loadShopPage();
  if (page.state !== 'open') return null;
  return storefrontApi.product(page.shop, page.shopper, slug);
});

/** The token of the shopper signed in on this browser, as the cookie the storefront's server set holds it. */
export async function shopperToken(): Promise<string | null> {
  return (await cookies()).get(SHOPPER_COOKIE)?.value ?? null;
}

/** CUS-05: who is signed in, read once per request; null when no one is, or the server no longer takes the token. */
export const loadShopper = cache(async (): Promise<ShopperView | null> => {
  const [page, token] = await Promise.all([loadShopPage(), shopperToken()]);
  if (page.state !== 'open' || token === null) return null;
  const answer = await storefrontApi.shopperCall<ShopperView>(
    page.shop,
    page.shopper,
    'GET',
    'me',
    token,
  );
  return answer.status === 200 ? answer.data : null;
});

/** CUS-06: the signed-in shopper's saved addresses; none when the read is refused. */
export async function loadAddresses(page: OpenShopPage): Promise<ShopperAddress[]> {
  const token = await shopperToken();
  if (token === null) return [];
  const answer = await storefrontApi.shopperCall<{ addresses: ShopperAddress[] }>(
    page.shop,
    page.shopper,
    'GET',
    'addresses',
    token,
  );
  return answer.data?.addresses ?? [];
}

/** ORD-18: a page of the orders with the signed-in shopper's phone. */
export async function loadOrders(
  page: OpenShopPage,
  number: number,
): Promise<ShopperOrderPage | null> {
  const token = await shopperToken();
  if (token === null) return null;
  const answer = await storefrontApi.shopperCall<ShopperOrderPage>(
    page.shop,
    page.shopper,
    'GET',
    `orders?page=${String(number)}`,
    token,
  );
  return answer.data;
}

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
