import type {
  AttributeDataType,
  BrandCorners,
  BrandFont,
  BrandSpacing,
  ItemCondition,
  OrderStatus,
  PaymentMethod,
  PaymentMethodKind,
  PaymentPolicy,
  PaymentSessionState,
  PaymentWay,
  StockState,
  StockUnit,
  UnitKind,
} from '@lytronix/validators';
import type { StorefrontEnvironment } from '../env';
import type { ServerAnswer, ServerApi } from './server-api';

// What the storefront reads from the server, as the server answers it (API-CONTRACT §8.4, §8.5; Slice 12). The shop a
// host serves comes from the internal context route; everything else is the public API, called with that shop's own
// storefront key, from the shopper's address, so each page is counted and limited as the shop's (SFT-11, RTE-04). The
// shop's details and its category tree, which every page's frame shows, are kept a minute per shop (Slice 12b's read):
// each page still makes its own counted read.

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
  /** The website the storefront key is registered for: the shop's Lytro address, which every API call names. */
  origin: string;
  /** Slice 13: the shop's own domain while it serves, its main address then; null on its Lytro address. */
  mainHost: string | null;
  /** Where the shop's links and previews point: its own domain while that serves, else its Lytro address. */
  publicOrigin: string;
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

/** BRN-07: a shop's own identity as tokens, while it shows; null for Lytro's default. */
export interface PublicBrand {
  version: string;
  colors: {
    main: string;
    accent: string;
    background: string;
    onMain: string;
    onAccent: string;
    text: string;
    mainText: string;
  };
  fonts: { heading: { id: BrandFont }; body: { id: BrandFont } };
  corners: BrandCorners;
  spacing: BrandSpacing;
  darkLogo: ImageView | null;
  icon: ImageView | null;
}

export interface PublicShop {
  name: string;
  slug: string;
  metaPixelId: string | null;
  logo: ImageView | null;
  contact: { phone: string | null; email: string | null; address: string | null };
  deliveryZones: DeliveryZoneView[];
  brand: PublicBrand | null;
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
  /** INV-24, UOM-04: whole packs only. */
  sharedStock: boolean;
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
  /** MNU-01: what a shopper chooses as they order it; empty for none. */
  modifierGroups: ModifierGroup[];
  /** ATR-08: what the shop asks when it is ordered; each answer is optional. */
  asked: AskedDetail[];
  /** CMB-06, CMB-09: a combo's "What's inside" and its saving; null for an ordinary product. */
  combo: PublicCombo | null;
}

export interface ModifierGroup {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  options: { id: string; name: string; priceChange: string; isDefault: boolean }[];
}
export interface AskedDetail {
  attributeId: string;
  name: string;
  dataType: AttributeDataType;
}
export interface PublicComboPart {
  position: number;
  quantity: string;
  productName: string;
  image: ImageView | null;
  choice: boolean;
  variants: { variantId: string; productName: string; label: string; available: boolean }[];
}
export interface PublicCombo {
  saving: string | null;
  parts: PublicComboPart[];
}

/** A product as a list shows it (PRD-09): with its card's swatches (ATR-18) and when it was added (Slice 12b). */
export interface ProductCard {
  id: string;
  slug: string;
  name: string;
  minPrice: string | null;
  maxPrice: string | null;
  stockState: StockState;
  image: ImageView | null;
  createdAt: string;
  swatches: OptionValue[];
}

export interface ProductPage {
  products: ProductCard[];
  nextCursor: string | null;
}

/** PRD-09, CCH-11, CCH-12: which products a list asks for. The order is the server's default when not given. */
export interface ProductQuery {
  category?: string;
  search?: string;
  sort?: string;
  inStock?: boolean;
  cursor?: string;
  limit?: number;
}

export interface PublicCategory {
  id: string;
  slug: string;
  name: string;
  image: ImageView | null;
  /** Its active products, its subcategories' included (Slice 12b). */
  productCount: number;
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

/** MNU-02: the options chosen in one of a product's add-on groups. */
export interface ModifierChoice {
  groupId: string;
  optionIds: string[];
}
export interface EstimateItem {
  variantId: string;
  quantity: number;
  modifiers?: ModifierChoice[];
}
/** SFT-20, Slice 12b: one item as it stands now. */
export interface EstimateLine {
  variantId: string;
  onSale: boolean;
  price: string | null;
  stockState: StockState | null;
  available: boolean;
  itemTotal: string | null;
  advance: string | null;
  paymentPolicy: PaymentPolicy | null;
  /** MNU-03: whether the add-ons asked for would be taken; an order for them is refused otherwise. */
  choicesFit: boolean;
}
/** TAX-03: one class's tax a total includes. */
export interface TaxLine {
  name: string;
  rate: string;
  amount: string;
}
export interface DeliveryEstimate {
  /** PRD-08: the advance an order of these would owe, by the order's own sum; null until known. */
  advance: string | null;
  lines: EstimateLine[];
  subtotal: string;
  zone: DeliveryZoneView | null;
  deliveryCharge: string | null;
  range: { from: string; to: string } | null;
  deliverable: boolean;
  notDeliveredHere: string[];
  taxes: TaxLine[];
}

/** ORD-02: one item of an order, as a shopper's checkout names it. */
export interface OrderItemInput extends EstimateItem {
  captured?: { attributeId: string; value: string }[];
  choices?: { part: number; variantIds: string[] }[];
}
export interface OrderInput {
  customerName: string;
  phone: string;
  locationId: number;
  deliveryAddress: string;
  shopperNote?: string;
  source: 'storefront' | 'landing_page';
  items: OrderItemInput[];
  /** PRD-08, SFT-07: the wallet chosen for an advance. The storefront's own server adds the return address. */
  payment?: { method: PaymentMethod };
}

/** WAL-06, PAY-06: a way a shopper may pay this shop, and how it takes the money. */
export interface ShopperPaymentMethod {
  method: PaymentMethod;
  kind: PaymentMethodKind;
  way: PaymentWay;
}

/** ORD-17, LND-11: an item as the shopper sees it. */
export interface ShopperItem {
  variantId: string | null;
  productName: string;
  attributes: { name: string; value: string; variantDefining: boolean }[];
  quantity: string;
  stockUnit: StockUnit;
  unitPrice: string;
  itemTotal: string;
  modifiers: { groupName: string; optionName: string; priceChange: string }[];
}
interface ShopperTotals {
  subtotal: string;
  deliveryCharge: string;
  discount: string;
  grandTotal: string;
  codAmount: string;
  taxes: TaxLine[];
}
/** ORD-02, LND-11: an order as placed; `purchaseEventId` is what the browser's `Purchase` carries (LND-16). */
export interface PlacedOrder extends ShopperTotals {
  orderNumber: string;
  trackingId: string;
  status: OrderStatus;
  createdAt: string;
  items: ShopperItem[];
  purchaseEventId: string;
  /** LND-10, SFT-07: where an advance is paid; null for cash on delivery. */
  payment: { paymentUrl: string; amount: string; expiresAt: string } | null;
}
/** ORD-17: an item on the tracking page, with its answers and a combo's parts. */
export interface TrackedItem extends ShopperItem {
  captured: { name: string; value: string }[];
  components: {
    productName: string;
    attributes: { name: string; value: string; variantDefining: boolean }[];
    quantity: string;
  }[];
}
export type TrackingStepName = 'placed' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled';
/** ORD-17: an order by its tracking ID -- never its customer's address or phone. */
export interface TrackedOrder extends ShopperTotals {
  orderNumber: string;
  trackingId: string;
  status: OrderStatus;
  timeline: { step: TrackingStepName; at: string }[];
  items: TrackedItem[];
  due: string;
  /** ORD-17 (Slice 5.2): an unverified order's open payment. */
  payment: {
    paymentUrl: string;
    amount: string;
    expiresAt: string;
    state: PaymentSessionState;
  } | null;
  courier: { name: string | null; trackingCode: string | null; trackingLink: string | null } | null;
  /**
   * CRR-12 (Slice 6.2's read): the courier's latest words about the parcel's journey, in either language it sent, and when; never
   * before it ships, and never a refusal or a change made in its panel.
   */
  courierMessage: { en: string | null; bn: string | null; at: string } | null;
  /** Slice 6.7 (STOREFRONT-DESIGN §7e): the courier says the parcel is going back, and the shop hasn't recorded it yet. */
  courierReturning: boolean;
}
export type TrackingRead =
  { kind: 'found'; order: TrackedOrder } | { kind: 'missing' } | { kind: 'busy' };

/** CUS-03, CUS-05: a shopper's account in this shop; the phone is the account and never changes. */
export interface ShopperView {
  id: string;
  name: string;
  phone: string;
  createdAt: string;
}
/** CUS-06: a saved address; `location` is the thana as the canonical list names it, null if it has since gone. */
export interface ShopperAddress {
  id: string;
  label: string;
  location: {
    id: number;
    nameEn: string;
    nameBn: string;
    cityCode: string | null;
    zillaId: number;
  } | null;
  deliveryAddress: string;
  isDefault: boolean;
}
/** ORD-18: an order with the shopper's phone: its number, status and total, never a name or address. */
export interface ShopperOrderRow {
  orderNumber: string;
  trackingId: string;
  status: OrderStatus;
  grandTotal: string;
  createdAt: string;
}
export interface ShopperOrderPage {
  orders: ShopperOrderRow[];
  page: number;
  limit: number;
  total: number;
  pages: number;
}
/** What the server answers on making an account or signing in; the token goes no further than the storefront's server. */
export interface ShopperSignedIn {
  token: string;
  expiresAt: string;
  shopper: ShopperView;
}

/** One shopper's request: the host they asked for, their address and language, carried onto every call. */
export interface ShopperRequest {
  host: string;
  /** The edge's client-address header as it reached the storefront, whole: the server picks the shopper from it by
      its own rule (CLIENT_IP_FORMAT, TRUSTED_PROXY_HOPS), as for a request the edge sent it directly. */
  clientAddress: string | null;
  language: Language;
}

/** A product read: the product, or the link it now lives at (LND-04), or nothing. */
export type ProductRead =
  { kind: 'found'; product: PublicProduct } | { kind: 'moved'; slug: string } | { kind: 'missing' };

// TEN-27: which shop a host serves is kept 5 seconds at most, so a removed domain, a suspended or archived shop, and a
// domain gone back to its subdomain all show within the 5 seconds the server's own lookup is held to.
const CONTEXT_TTL_MS = 5_000;
// Slice 12b's read: the frame every page shows -- the shop's details and its categories -- is read at most once a
// minute per shop, as an outside site's server could keep it; a logo or a category change shows within the minute.
const SHELL_TTL_MS = 60_000;

/** The server's answers the storefront's pages need, for the shop the shopper's host names. */
export class StorefrontApi {
  private readonly contexts = new Map<string, { at: number; context: StorefrontContext }>();
  private readonly shells = new Map<string, { at: number; read: Promise<unknown> }>();

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

  shop(shop: StorefrontShopContext, shopper: ShopperRequest): Promise<PublicShop> {
    return this.kept(`${shop.slug} shop`, async () =>
      StorefrontApi.required(
        await this.call<PublicShop>(shop, shopper, 'GET', '/v1/shop'),
        'the shop',
      ),
    );
  }

  categories(shop: StorefrontShopContext, shopper: ShopperRequest): Promise<PublicCategory[]> {
    return this.kept(
      `${shop.slug} categories`,
      async () =>
        StorefrontApi.required(
          await this.call<{ categories: PublicCategory[] }>(
            shop,
            shopper,
            'GET',
            '/v1/catalogue/categories',
          ),
          'the categories',
        ).categories,
    );
  }

  /** A page of the shop's products (PRD-09): a category's, a search's, only what is in stock, from a cursor. Null for
      a category the server no longer shows, as one hidden since the tree was read. */
  async products(
    shop: StorefrontShopContext,
    shopper: ShopperRequest,
    query: ProductQuery,
  ): Promise<ProductPage | null> {
    const suffix = productQueryString(query);
    const answer = await this.call<ProductPage>(
      shop,
      shopper,
      'GET',
      `/v1/catalogue/products${suffix === '' ? '' : `?${suffix}`}`,
    );
    if (answer.status === 404) return null;
    return StorefrontApi.required(answer, 'the products');
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

  /** The items as they stand now, and what delivering the ones that can be ordered would cost, to a thana or (before
      one is picked) across the shop's zones. Null when the server refuses the request itself. */
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

  /** WAL-06, PAY-06: how a shopper may pay; none is what a checkout has when this can't be read, and the order says why. */
  async paymentMethods(
    shop: StorefrontShopContext,
    shopper: ShopperRequest,
  ): Promise<ShopperPaymentMethod[]> {
    const answer = await this.call<{ methods: ShopperPaymentMethod[] }>(
      shop,
      shopper,
      'GET',
      '/v1/payment-methods',
    );
    return (answer.data?.methods ?? []).map(({ method, kind, way }) => ({ method, kind, way }));
  }

  /** ORD-02, SFT-06: a shopper's order, once per key. The answer as it came: the page says what a refusal means. */
  placeOrder(
    shop: StorefrontShopContext,
    shopper: ShopperRequest,
    body: unknown,
    idempotencyKey: string,
  ): Promise<ServerAnswer<PlacedOrder>> {
    return this.call<PlacedOrder>(shop, shopper, 'POST', '/v1/orders', body, {
      'idempotency-key': idempotencyKey,
    });
  }

  /** ORD-17, SFT-08: the order with this tracking ID, in any case. */
  async track(
    shop: StorefrontShopContext,
    shopper: ShopperRequest,
    trackingId: string,
  ): Promise<TrackingRead> {
    const answer = await this.call<TrackedOrder>(
      shop,
      shopper,
      'GET',
      `/v1/track/${encodeURIComponent(trackingId)}`,
    );
    if (answer.status === 404) return { kind: 'missing' };
    if (answer.status === 429) return { kind: 'busy' };
    return { kind: 'found', order: StorefrontApi.required(answer, 'the order') };
  }

  /** CUS-03 to CUS-06, ORD-18: one call on the shopper's account, under their sign-in once there is one. The answer as
      it came: the page says what a refusal means. */
  shopperCall<T>(
    shop: StorefrontShopContext,
    shopper: ShopperRequest,
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    token: string | null,
    body?: unknown,
  ): Promise<ServerAnswer<T>> {
    return this.call<T>(
      shop,
      shopper,
      method,
      `/v1/shopper/${path}`,
      body,
      token === null ? {} : { 'x-shopper-token': token },
    );
  }

  /** One shared read per key for SHELL_TTL_MS; a failed read is not kept, so the next page asks again. */
  private kept<T>(key: string, read: () => Promise<T>): Promise<T> {
    const held = this.shells.get(key);
    if (held && this.now() - held.at < SHELL_TTL_MS) return held.read as Promise<T>;
    const fresh = read();
    this.shells.set(key, { at: this.now(), read: fresh });
    fresh.catch(() => {
      if (this.shells.get(key)?.read === fresh) this.shells.delete(key);
    });
    return fresh;
  }

  private call<T>(
    shop: StorefrontShopContext,
    shopper: ShopperRequest,
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    body?: unknown,
    extra: Record<string, string> = {},
  ): Promise<ServerAnswer<T>> {
    const headers: Record<string, string> = {
      ...extra,
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
    if (shopper.clientAddress) headers[this.env.clientIpHeader] = shopper.clientAddress;
    return headers;
  }

  private static required<T>(answer: ServerAnswer<T>, what: string): T {
    if (answer.status >= 200 && answer.status < 300 && answer.data !== null) return answer.data;
    throw new Error(
      `the server did not give ${what} (status ${String(answer.status)}${answer.code ? `, ${answer.code}` : ''})`,
    );
  }
}

/** A list request's query string, its parameters in one order, so equal requests read alike (CCH-03). */
export function productQueryString(query: ProductQuery): string {
  const search = new URLSearchParams();
  if (query.category) search.set('category', query.category);
  if (query.search) search.set('search', query.search);
  if (query.sort) search.set('sort', query.sort);
  if (query.inStock) search.set('inStock', 'true');
  if (query.cursor) search.set('cursor', query.cursor);
  if (query.limit) search.set('limit', String(query.limit));
  return search.toString();
}
