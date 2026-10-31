import { Module } from '@nestjs/common';
import { ClientIp } from '../../common/client-ip';
import { apiOrigin, mainOrigin } from '../../common/shop-address';
import type { Env } from '../../config/env';
import { ENV } from '../../config/tokens';
import {
  DrizzleAdTrackingStore,
  DrizzleCatalogFeedStore,
} from '../../database/adapters/ad-tracking.adapter';
import {
  DrizzlePublicCatalogueStore,
  PostgresCatalogueSearch,
} from '../../database/adapters/public-catalogue.adapter';
import {
  DrizzleApiKeyStore,
  DrizzleApiUsageStore,
} from '../../database/adapters/public-api.adapter';
import { BrandModule } from '../brand/brand.module';
import { PaymentMethodsModule } from '../payment-methods/payment-methods.module';
import { DomainsModule } from '../domains/domains.module';
import { CatalogueModule } from '../catalogue/catalogue.module';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module';
import { ShoppersModule } from '../shoppers/shoppers.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { UsageWarningsModule } from '../usage-warnings/usage-warnings.module';
import { PublicCatalogueController } from './controllers/public-catalogue.controller';
import { PublicFeedController } from './controllers/public-feed.controller';
import { PublicShopController } from './controllers/public-shop.controller';
import { CatalogFeedGuard } from './guards/catalog-feed.guard';
import { PublicKeyGuard } from './guards/public-key.guard';
import { AdTrackingService } from './services/ad-tracking.service';
import { ApiKeyAuthenticator } from './services/api-key-authenticator';
import { PublicApiEraser } from './services/public-api-eraser';
import { ApiKeyService } from './services/api-key.service';
import { CatalogFeedCsv } from './services/catalog-feed-csv';
import { CatalogFeedService, type CatalogFeedSettings } from './services/catalog-feed.service';
import { CATALOGUE_CACHE_DEFAULTS, CatalogueCache } from './services/catalogue-cache';
import { CatalogueVersionReader } from './services/catalogue-version-reader';
import { PublicApiHost } from './services/public-api-host';
import { PublicCatalogue } from './services/public-catalogue';
import { RequestLimits } from './services/request-limits';
import { RequestQuota } from './services/request-quota';
import { VisitorLimit } from './services/visitor-limit';
import { BalanceModule } from '../balance/balance.module';
import { DeliveryModule } from '../delivery/delivery.module';
import { MediaModule } from '../media/media.module';
import { OrdersModule } from '../orders/orders.module';
import { IdempotencyModule } from '../../common/idempotency/idempotency.module';
import { QueueModule } from '../shared/queue/queue.module';
import { PublicDeliveryController } from './controllers/public-delivery.controller';
import { PublicOrdersController } from './controllers/public-orders.controller';
import { PublicShopperController } from './controllers/public-shopper.controller';
import { PublicPaymentMethodsController } from './controllers/public-payment-methods.controller';
import { StorefrontContextController } from './controllers/storefront-context.controller';
import { GraphMetaConversions } from './services/graph-meta-conversions';
import { MetaPurchaseSender } from './services/meta-purchase-sender';
import { OrderLimits } from './services/order-limits';
import { PublicOrderService } from './services/public-order.service';
import { StorefrontContextService } from './services/storefront-context.service';
import { ShopperGate } from './services/shopper-gate';
import { StorefrontKeyService } from './services/storefront-key.service';
import {
  AD_TRACKING_STORE,
  API_CLOCK,
  API_KEY_STORE,
  API_USAGE_STORE,
  CATALOG_FEED_SETTINGS,
  CATALOG_FEED_STORE,
  CATALOGUE_CACHE_SETTINGS,
  CATALOGUE_SEARCH,
  META_CONVERSIONS,
  PUBLIC_CATALOGUE_STORE,
} from './tokens';

// D3-1, D3-2, D3-7: the public API -- a shop's public keys, the gate every public API route sits behind (key,
// website, shop open, per-visitor and per-cycle limits), the API host itself, and the public catalogue with its memory
// cache, ad tracking and the Meta catalog feed (Slice 9); a shopper's orders and their tracking, with Meta's
// server-side purchase (Phase 4 Slice 4.2). Depends on tenancy (hosts), catalogue (the activity log a key's changes are
// written to, and the products it shows), orders (making and tracking them), the queue (Meta's purchases) and platform
// settings (the cache lifetimes and the per-minute limits); billing reaches it for the day-60 deletion.
@Module({
  imports: [
    BalanceModule,
    DeliveryModule,
    IdempotencyModule,
    MediaModule,
    OrdersModule,
    QueueModule,
    TenancyModule,
    CatalogueModule,
    PlatformSettingsModule,
    UsageWarningsModule,
    BrandModule,
    PaymentMethodsModule,
    // Slice 13: the storefront's context and the catalog feed name the shop's own domain while it serves.
    DomainsModule,
    // Slice 4.4b: shoppers' accounts, sign-in and saved addresses.
    ShoppersModule,
  ],
  controllers: [
    PublicShopController,
    PublicCatalogueController,
    PublicFeedController,
    StorefrontContextController,
    PublicDeliveryController,
    PublicOrdersController,
    PublicShopperController,
    PublicPaymentMethodsController,
  ],
  providers: [
    { provide: API_KEY_STORE, useClass: DrizzleApiKeyStore },
    { provide: API_USAGE_STORE, useClass: DrizzleApiUsageStore },
    { provide: API_CLOCK, useValue: (): Date => new Date() },
    StorefrontKeyService,
    StorefrontContextService,
    ShopperGate,
    { provide: PUBLIC_CATALOGUE_STORE, useClass: DrizzlePublicCatalogueStore },
    { provide: CATALOGUE_SEARCH, useClass: PostgresCatalogueSearch },
    { provide: CATALOGUE_CACHE_SETTINGS, useValue: CATALOGUE_CACHE_DEFAULTS },
    { provide: AD_TRACKING_STORE, useClass: DrizzleAdTrackingStore },
    { provide: CATALOG_FEED_STORE, useClass: DrizzleCatalogFeedStore },
    {
      provide: CATALOG_FEED_SETTINGS,
      inject: [ENV],
      useFactory: (env: Env): CatalogFeedSettings => ({
        feedUrl: (token) => `${apiOrigin(env)}/v1/feeds/meta/${token}.csv`,
        shopOrigin: (slug, ownDomain) => mainOrigin(env, slug, ownDomain),
      }),
    },
    AdTrackingService,
    CatalogFeedService,
    CatalogFeedCsv,
    CatalogFeedGuard,
    CatalogueCache,
    CatalogueVersionReader,
    PublicCatalogue,
    ClientIp,
    ApiKeyAuthenticator,
    ApiKeyService,
    PublicApiEraser,
    RequestLimits,
    RequestQuota,
    VisitorLimit,
    OrderLimits,
    PublicOrderService,
    { provide: META_CONVERSIONS, useClass: GraphMetaConversions },
    MetaPurchaseSender,
    PublicKeyGuard,
    PublicApiHost,
  ],
  exports: [
    ApiKeyService,
    // For the dashboard's ad tracking and feed screens (team).
    AdTrackingService,
    CatalogFeedService,
    // For the queue's worker that tells Meta of a shopper's purchase (LND-16).
    MetaPurchaseSender,
    PublicApiEraser,
    PublicApiHost,
    RequestQuota,
  ],
})
export class PublicApiModule {}
