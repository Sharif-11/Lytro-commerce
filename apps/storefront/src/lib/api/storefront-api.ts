import type {
  AttributeDataType,
  ItemCondition,
  PaymentPolicy,
  StockState,
  StockUnit,
  UnitKind,
} from '@lytronix/validators';
import type { StorefrontEnvironment } from '../env';
import type { ServerAnswer, ServerApi } from './server-api';

// What the storefront reads from the server, as the server answers it (API-CONTRACT §8.4, §8.5; Slice 12). The shop a
// host serves comes from the internal context route; everything else is the public API, called with that shop's own
// storefront key, from the shopper's address, so each page is counted and limited as the shop's (SFT-11, RTE-04).

export type Language = 'bn' | 'en';
export interface Bilingual {
  en: string;
  bn: string;
}

/** TEN-08, LIF-07: what a host is. A closed shop is named to nobody, so its page shows nothing of it. */
export interface StorefrontShopContext {
  slug: string;
  storefrontEnabled: boolean;
  key: string;
  origin: string;
}
export interface StorefrontContext {
  outcome: 'open' | 'closed' | 'not_found';
  shop: StorefrontShopContext | null;
}

export interface ImageView {
  id: string;
  urls: { main: string; thumbnail: string };
}

export interface DeliveryZoneView {
  id: string;
  name: Bilingual;
  charge: string;
  noDelivery: boolean;
}

export interface PublicShop {
  name: string;
  slug: string;
  metaPixelId: string | null;
  logo: ImageView | null;
  contact: { phone: string | null; email: string | null; address: string | null };
  deliveryZones: DeliveryZoneView[];
}

export interface OptionValue {
  id: string;
  value: string;
  swatchColor: string | null;
  swatchImage: ImageView | null;
}
export interface ProductOption {
  attributeId: string;
  name: string;
  dataType: AttributeDataType;
  unitKind: UnitKind | null;
  values: OptionValue[];
}
export interface ProductAttribute {
  name: string;
  dataType: AttributeDataType;
  unitKind: UnitKind | null;
  values: string[];
  text: string | null;
  number: string | null;
  yes: boolean | null;
}
export interface ProductVariant {
  id: string;
  optionIds: string[];
  price: string;
  stockState: StockState;
  available: boolean;
}
/** PRD-17: a size chart is a table of short text, or a ready image in its place. */
export interface SizeChart {
  rows: string[][] | null;
  image: ImageView | null;
}

export interface PublicProduct {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  minPrice: string | null;
  maxPrice: string | null;
  stockState: StockState;
  stockUnit: StockUnit;
  condition: ItemCondition;
  primaryCategoryId: string | null;
  categoryIds: string[];
  images: ImageView[];
  video: { id: string; urls: { video: string; poster: string } } | null;
  options: ProductOption[];
  attributes: ProductAttribute[];
  variants: ProductVariant[];
  sizeChart: SizeChart | null;
  paymentPolicy: PaymentPolicy;
  advanceAmount: string | null;
  deliveryZoneIds: string[];
}

/** A product as a list shows it (PRD-09). */
export interface ProductCard {
  id: string;
  slug: string;
  name: string;
  minPrice: string | null;
  maxPrice: string | null;
  stockState: StockState;
  image: ImageView | null;
}

export interface PublicCategory {
  id: string;
  slug: string;
  name: string;
  image: ImageView | null;
  children: PublicCategory[];
}

export interface LocationThana {
  id: number;
  nameEn: string;
  nameBn: string;
  cityCode: string | null;
}
export interface Locations {
  cities: { code: string; nameEn: string; nameBn: string }[];
  zillas: { id: number; nameEn: string; nameBn: string; thanas: LocationThana[] }[];
}

export interface EstimateItem {
  variantId: string;
  quantity: number;
}
export interface DeliveryEstimate {
  zone: DeliveryZoneView | null;
  deliveryCharge: string | null;
  range: { from: string; to: string } | null;
  deliverable: boolean;
  notDeliveredHere: string[];
}

/** One shopper's request: the host they asked for, their address and language, carried onto every call. */
export interface ShopperRequest {
  host: string;
  ip: string | null;
  language: Language;
}

/** A product read: the product, or the link it now lives at (LND-04), or nothing. */
export type ProductRead =
  { kind: 'found'; product: PublicProduct } | { kind: 'moved'; slug: string } | { kind: 'missing' };

const CONTEXT_TTL_MS = 30_000;

/** The server's answers the storefront's pages need, for the shop the shopper's host names. */
export class StorefrontApi {
  private readonly contexts = new Map<string, { at: number; context: StorefrontContext }>();

  constructor(
    private readonly server: Pick<ServerApi, 'send'>,
    private readonly env: StorefrontEnvironment,
    private readonly now: () => number = Date.now,
  ) {}

  /** Which shop a host serves. Kept briefly per host, so a shopper's pages do not each ask; a shop that closes or
      turns its storefront off is seen within the half-minute. */
  async context(host: string): Promise<StorefrontContext> {
    const name = host.toLowerCase();
    const kept = this.contexts.get(name);
    if (kept && this.now() - kept.at < CONTEXT_TTL_MS) return kept.context;
    const answer = await this.server.send<StorefrontContext>({
      method: 'GET',
      path: `/api/v1/internal/storefront/context?host=${encodeURIComponent(name)}`,
      host: this.env.platformDomain,
      headers: this.internalHeaders(),
    });
    if (answer.status !== 200 || !answer.data) {
      throw new Error(`the server did not name the shop (status ${String(answer.status)})`);
    }
    this.contexts.set(name, { at: this.now(), context: answer.data });
    return answer.data;
  }

  async shop(shop: StorefrontShopContext, shopper: ShopperRequest): Promise<PublicShop> {
    return StorefrontApi.required(
      await this.call<PublicShop>(shop, shopper, 'GET', '/v1/shop'),
      'the shop',
    );
  }

  async categories(
    shop: StorefrontShopContext,
    shopper: ShopperRequest,
  ): Promise<PublicCategory[]> {
    return StorefrontApi.required(
      await this.call<{ categories: PublicCategory[] }>(
        shop,
        shopper,
        'GET',
        '/v1/catalogue/categories',
      ),
      'the categories',
    ).categories;
  }

  /** A page of the shop's products, newest first unless asked otherwise (PRD-09). */
  async products(
    shop: StorefrontShopContext,
    shopper: ShopperRequest,
    query: { category?: string; sort?: string; limit?: number },
  ): Promise<{ products: ProductCard[]; nextCursor: string | null }> {
    const search = new URLSearchParams();
    if (query.category) search.set('category', query.category);
    if (query.sort) search.set('sort', query.sort);
    if (query.limit) search.set('limit', String(query.limit));
    const encoded = search.toString();
    const suffix = encoded === '' ? '' : `?${encoded}`;
    return StorefrontApi.required(
      await this.call<{ products: ProductCard[]; nextCursor: string | null }>(
        shop,
        shopper,
        'GET',
        `/v1/catalogue/products${suffix}`,
      ),
      'the products',
    );
  }

  /** A product by its link. An old link answers with the product under its current one, so the page redirects. */
  async product(
    shop: StorefrontShopContext,
    shopper: ShopperRequest,
    slug: string,
  ): Promise<ProductRead> {
    const answer = await this.call<PublicProduct>(
      shop,
      shopper,
      'GET',
      `/v1/catalogue/products/${encodeURIComponent(slug)}`,
    );
    if (answer.status === 404) return { kind: 'missing' };
    const product = StorefrontApi.required(answer, 'the product');
    return product.slug === slug
      ? { kind: 'found', product }
      : { kind: 'moved', slug: product.slug };
  }

  async locations(shop: StorefrontShopContext, shopper: ShopperRequest): Promise<Locations> {
    return StorefrontApi.required(
      await this.call<Locations>(shop, shopper, 'GET', '/v1/locations'),
      'the locations',
    );
  }

  /** What delivering these items would cost, to a thana or (before one is picked) across the shop's zones. Null when
      the server refuses the items, as for a product taken down since the page was drawn. */
  async estimate(
    shop: StorefrontShopContext,
    shopper: ShopperRequest,
    body: { locationId?: number; items: EstimateItem[] },
  ): Promise<DeliveryEstimate | null> {
    const answer = await this.call<DeliveryEstimate>(
      shop,
      shopper,
      'POST',
      '/v1/delivery-estimate',
      body,
    );
    if (answer.status === 422 || answer.status === 400) return null;
    return StorefrontApi.required(answer, 'the delivery estimate');
  }

  private call<T>(
    shop: StorefrontShopContext,
    shopper: ShopperRequest,
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
  ): Promise<ServerAnswer<T>> {
    const headers: Record<string, string> = {
      ...this.edgeHeaders(shopper),
      authorization: `Bearer ${shop.key}`,
      origin: shop.origin,
      'accept-language': shopper.language,
    };
    return this.server.send<T>({
      method,
      path,
      host: `api.${this.env.platformDomain}`,
      headers,
      body,
    });
  }

  private internalHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    if (this.env.edgeSecret) headers['x-lytronix-edge-secret'] = this.env.edgeSecret;
    if (this.env.storefrontSecret) headers['x-lytro-storefront'] = this.env.storefrontSecret;
    return headers;
  }

  /** The edge secret, and with it the shopper's address: the server trusts a forwarded address only from a caller
      holding the secret (D14), so each shopper is limited as themself, never all as the storefront. */
  private edgeHeaders(shopper: ShopperRequest): Record<string, string> {
    const headers: Record<string, string> = {};
    if (!this.env.edgeSecret) return headers;
    headers['x-lytronix-edge-secret'] = this.env.edgeSecret;
    if (shopper.ip) headers[this.env.clientIpHeader] = shopper.ip;
    return headers;
  }

  private static required<T>(answer: ServerAnswer<T>, what: string): T {
    if (answer.status >= 200 && answer.status < 300 && answer.data !== null) return answer.data;
    throw new Error(
      `the server did not give ${what} (status ${String(answer.status)}${answer.code ? `, ${answer.code}` : ''})`,
    );
  }
}
