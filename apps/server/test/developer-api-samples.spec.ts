import 'reflect-metadata';
import { RequestMethod, type Type } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { shopperOrdersQuerySchema } from '@lytronix/validators';
import {
  DOC_COMMON_ERRORS,
  DOC_ERROR_CODES,
  DOC_FIRST_CALL,
  DOC_MINUTE_LIMIT_FIGURES,
  DOC_ROUTES,
  type DocRoute,
  type RouteError,
} from '@lytronix/validators/developer-api';
import { HTTP_STATUS } from '../src/common/api-error';
import { OkDto } from '../src/common/dto/ok.dto';
import type { MessageKey } from '../src/common/i18n/message-key';
import { translate } from '../src/common/i18n/messages';
import { PublicCatalogueController } from '../src/modules/public-api/controllers/public-catalogue.controller';
import {
  DeliveryEstimateBodyDto,
  DeliveryEstimateDto,
  PublicDeliveryController,
  PublicLocationsDto,
} from '../src/modules/public-api/controllers/public-delivery.controller';
import { PublicFeedController } from '../src/modules/public-api/controllers/public-feed.controller';
import {
  PlacedOrderDto,
  PublicOrderBodyDto,
  PublicOrdersController,
  TrackedOrderDto,
} from '../src/modules/public-api/controllers/public-orders.controller';
import {
  PublicPaymentMethodsController,
  PublicPaymentMethodsDto,
} from '../src/modules/public-api/controllers/public-payment-methods.controller';
import {
  PublicShopController,
  PublicShopQueryDto,
  PublicShopViewDto,
} from '../src/modules/public-api/controllers/public-shop.controller';
import {
  PublicShopperController,
  ShopperAddressDto,
  ShopperAddressesDto,
  ShopperAddressUpdateDto,
  ShopperCodeDto,
  ShopperCodeSentDto,
  ShopperOrderPageDto,
  ShopperPasswordDto,
  ShopperProfileDto,
  ShopperSignedInDto,
  ShopperSigninDto,
  ShopperSignupDto,
  ShopperViewDto,
} from '../src/modules/public-api/controllers/public-shopper.controller';
import {
  CatalogueVersionViewDto,
  PublicCategoriesDto,
  PublicOfferDto,
  PublicProductDetailDto,
  PublicProductListQueryDto,
  PublicProductPageDto,
} from '../src/modules/public-api/dto/public-catalogue.dto';
import { CATALOG_FEED_COLUMNS } from '../src/modules/public-api/services/catalog-feed-csv';
import {
  DEFAULT_ORDERS_PER_SHOP_PER_MINUTE,
  ORDERS_PER_VISITOR_PER_MINUTE,
  TRACKING_READS_PER_VISITOR_PER_MINUTE,
} from '../src/modules/public-api/services/order-limits';
import {
  CODES_PER_VISITOR_PER_MINUTE,
  SIGNINS_PER_VISITOR_PER_MINUTE,
} from '../src/modules/public-api/services/shopper-gate';
import { DEFAULT_REQUESTS_PER_VISITOR_PER_MINUTE } from '../src/modules/public-api/services/visitor-limit';

// TENANT-DASHBOARD-DESIGN §7.48 (the developer docs): every sample the docs show is parsed with the schema the API
// itself validates or answers with, every message is the server's own, and every public route is documented -- so the
// docs can never say what the API doesn't do. A route added, a field renamed or a message reworded fails here first.

interface Shapes {
  /** The answer's success message key (the route's @ResponseMessage). */
  ok?: MessageKey;
  query?: z.ZodType;
  body?: z.ZodType;
  data?: z.ZodType;
}

const SHAPES: Readonly<Record<string, Shapes>> = {
  shop: { ok: 'ShopRetrieved', query: PublicShopQueryDto.schema, data: PublicShopViewDto.schema },
  products: {
    ok: 'ProductsListed',
    query: PublicProductListQueryDto.schema,
    data: PublicProductPageDto.schema,
  },
  product: { ok: 'ProductRetrieved', data: PublicProductDetailDto.schema },
  categories: { ok: 'CategoriesListed', data: PublicCategoriesDto.schema },
  offer: { ok: 'OfferRetrieved', data: PublicOfferDto.schema },
  locations: { ok: 'LocationsListed', data: PublicLocationsDto.schema },
  estimate: {
    ok: 'DeliveryEstimated',
    body: DeliveryEstimateBodyDto.schema,
    data: DeliveryEstimateDto.schema,
  },
  order: { ok: 'OrderCreated', body: PublicOrderBodyDto.schema, data: PlacedOrderDto.schema },
  track: { ok: 'OrderTracked', data: TrackedOrderDto.schema },
  'sh-code': {
    ok: 'ShopperCodeSent',
    body: ShopperCodeDto.schema,
    data: ShopperCodeSentDto.schema,
  },
  'sh-signup': {
    ok: 'ShopperSignedUp',
    body: ShopperSignupDto.schema,
    data: ShopperSignedInDto.schema,
  },
  'sh-signin': {
    ok: 'ShopperSignedIn',
    body: ShopperSigninDto.schema,
    data: ShopperSignedInDto.schema,
  },
  'sh-signout': { ok: 'ShopperSignedOut', data: OkDto.schema },
  'sh-me': { ok: 'ShopperRetrieved', data: ShopperViewDto.schema },
  'sh-me-edit': {
    ok: 'ShopperUpdated',
    body: ShopperProfileDto.schema,
    data: ShopperViewDto.schema,
  },
  'sh-password': { ok: 'PasswordChanged', body: ShopperPasswordDto.schema, data: OkDto.schema },
  'sh-addresses': { ok: 'ShopperAddressesRetrieved', data: ShopperAddressesDto.schema },
  'sh-address-new': {
    ok: 'ShopperAddressSaved',
    body: ShopperAddressDto.schema,
    data: ShopperAddressesDto.schema,
  },
  'sh-address-edit': {
    ok: 'ShopperAddressSaved',
    body: ShopperAddressUpdateDto.schema,
    data: ShopperAddressesDto.schema,
  },
  'sh-address-delete': { ok: 'ShopperAddressRemoved', data: ShopperAddressesDto.schema },
  'sh-orders': {
    ok: 'OrdersRetrieved',
    query: shopperOrdersQuerySchema,
    data: ShopperOrderPageDto.schema,
  },
  // The Meta feed answers CSV, checked against its columns below.
  feed: {},
  methods: { ok: 'PaymentMethodsRetrieved', data: PublicPaymentMethodsDto.schema },
  version: { ok: 'CatalogueVersionRetrieved', data: CatalogueVersionViewDto.schema },
};

const CONTROLLERS: readonly Type[] = [
  PublicShopController,
  PublicCatalogueController,
  PublicDeliveryController,
  PublicOrdersController,
  PublicShopperController,
  PublicFeedController,
  PublicPaymentMethodsController,
];

/** "GET /public/catalogue/products/:id": each route a public controller serves. */
function servedRoutes(): string[] {
  return CONTROLLERS.flatMap((controller) => {
    const base = String(Reflect.getMetadata(PATH_METADATA, controller) ?? '');
    const proto = controller.prototype as Record<string, unknown>;
    return Object.getOwnPropertyNames(proto).flatMap((name) => {
      const handler = proto[name];
      if (name === 'constructor' || typeof handler !== 'function') return [];
      const path = Reflect.getMetadata(PATH_METADATA, handler) as string | undefined;
      if (path === undefined) return [];
      const method = RequestMethod[Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod];
      const joined = `/${base}/${path}`.replace(/\/+/g, '/').replace(/(.)\/$/, '$1');
      return [`${method} ${joined}`];
    });
  });
}

/** The same form for a documented route: {name} is :name; the feed's {token}.csv is the controller's :file. */
function documentedRoute(r: DocRoute): string {
  const path =
    r.p === '/feeds/meta/{token}.csv' ? '/feeds/meta/:file' : r.p.replace(/\{(\w+)\}/g, ':$1');
  return `${r.m} /public${path}`;
}

const queryOf = (r: DocRoute): Record<string, string> =>
  Object.fromEntries(new URLSearchParams(r.q ?? ''));

function expectServerMessage(row: RouteError): void {
  const [status, code, key, bn, en] = row;
  expect(HTTP_STATUS[code as keyof typeof HTTP_STATUS], `${code}'s status`).toBe(status);
  expect(translate(key as MessageKey, 'bn'), `${key} in Bangla`).toBe(bn);
  expect(translate(key as MessageKey, 'en'), `${key} in English`).toBe(en);
}

describe('the developer docs against the API (TENANT-DASHBOARD-DESIGN §7.48)', () => {
  it('documents every route the public API serves, and none it does not', () => {
    expect(DOC_ROUTES.map(documentedRoute).sort()).toEqual(servedRoutes().sort());
    expect(Object.keys(SHAPES).sort()).toEqual(DOC_ROUTES.map((r) => r.id).sort());
  });

  it.each(DOC_ROUTES.map((r) => [r.id, r] as const))(
    '%s: its sample query, body and answer are what the API reads and answers',
    (id, r) => {
      const shapes = SHAPES[id] ?? {};
      if (shapes.query) expect(shapes.query.safeParse(queryOf(r)).error).toBeUndefined();
      if (shapes.body) expect(shapes.body.safeParse(r.body).error).toBeUndefined();
      if (shapes.data) {
        const read = shapes.data.safeParse(r.data);
        expect(read.error).toBeUndefined();
        // The schemas drop a field they don't know: the answer read back must be the sample, so none is invented.
        expect(JSON.parse(JSON.stringify(read.data))).toEqual(r.data);
      }
      if (shapes.ok && r.ok) {
        expect(r.ok).toEqual([translate(shapes.ok, 'bn'), translate(shapes.ok, 'en')]);
      }
      for (const row of r.errs ?? []) expectServerMessage(row);
    },
  );

  it('states the minute limits the server holds to', () => {
    expect(DOC_MINUTE_LIMIT_FIGURES).toEqual({
      requestsPerVisitor: DEFAULT_REQUESTS_PER_VISITOR_PER_MINUTE,
      ordersPerVisitor: ORDERS_PER_VISITOR_PER_MINUTE,
      ordersPerShop: DEFAULT_ORDERS_PER_SHOP_PER_MINUTE,
      trackingPerVisitor: TRACKING_READS_PER_VISITOR_PER_MINUTE,
      codesPerVisitor: CODES_PER_VISITOR_PER_MINUTE,
      signinsPerVisitor: SIGNINS_PER_VISITOR_PER_MINUTE,
    });
  });

  it('shows the Meta feed with its real columns', () => {
    const feed = DOC_ROUTES.find((r) => r.id === 'feed');
    expect(feed?.csvHead).toBe(CATALOG_FEED_COLUMNS.join(','));
  });

  it("gives the first call's answer and the errors every route has in the server's own words", () => {
    expect(CatalogueVersionViewDto.schema.safeParse(DOC_FIRST_CALL.data).error).toBeUndefined();
    for (const row of DOC_COMMON_ERRORS) expectServerMessage(row);
    for (const [status, code] of DOC_ERROR_CODES) {
      expect(HTTP_STATUS[code as keyof typeof HTTP_STATUS], code).toBe(status);
    }
  });
});
