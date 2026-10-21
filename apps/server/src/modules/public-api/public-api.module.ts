import { Module } from '@nestjs/common';
import { ClientIp } from '../../common/client-ip';
import {
  DrizzlePublicCatalogueStore,
  PostgresCatalogueSearch,
} from '../../database/adapters/public-catalogue.adapter';
import {
  DrizzleApiKeyStore,
  DrizzleApiUsageStore,
} from '../../database/adapters/public-api.adapter';
import { CatalogueModule } from '../catalogue/catalogue.module';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { PublicCatalogueController } from './controllers/public-catalogue.controller';
import { PublicShopController } from './controllers/public-shop.controller';
import { PublicKeyGuard } from './guards/public-key.guard';
import { ApiKeyAuthenticator } from './services/api-key-authenticator';
import { ApiKeyEraser } from './services/api-key-eraser';
import { ApiKeyService } from './services/api-key.service';
import { CATALOGUE_CACHE_DEFAULTS, CatalogueCache } from './services/catalogue-cache';
import { CatalogueVersionReader } from './services/catalogue-version-reader';
import { ConsoleRequestQuotaNotifier } from './services/console-request-quota-notifier';
import { PublicApiHost } from './services/public-api-host';
import { PublicCatalogue } from './services/public-catalogue';
import { RequestLimits } from './services/request-limits';
import { RequestQuota } from './services/request-quota';
import {
  API_CLOCK,
  API_KEY_STORE,
  API_USAGE_STORE,
  CATALOGUE_CACHE_SETTINGS,
  CATALOGUE_SEARCH,
  PUBLIC_CATALOGUE_STORE,
  REQUEST_QUOTA_NOTIFIER,
} from './tokens';

// D3-1, D3-2, D3-7: the public API -- a shop's public keys, the gate every public API route sits behind (key,
// website, shop open, per-minute and per-cycle limits), the API host itself, and the public catalogue with its memory
// cache (Slice 9). Depends on tenancy (hosts), catalogue (the activity log a key's changes are written to, and the
// products it shows) and platform settings (the cache lifetimes); billing reaches it for the day-60 deletion.
@Module({
  imports: [TenancyModule, CatalogueModule, PlatformSettingsModule],
  controllers: [PublicShopController, PublicCatalogueController],
  providers: [
    { provide: API_KEY_STORE, useClass: DrizzleApiKeyStore },
    { provide: API_USAGE_STORE, useClass: DrizzleApiUsageStore },
    { provide: REQUEST_QUOTA_NOTIFIER, useClass: ConsoleRequestQuotaNotifier },
    { provide: API_CLOCK, useValue: (): Date => new Date() },
    { provide: PUBLIC_CATALOGUE_STORE, useClass: DrizzlePublicCatalogueStore },
    { provide: CATALOGUE_SEARCH, useClass: PostgresCatalogueSearch },
    { provide: CATALOGUE_CACHE_SETTINGS, useValue: CATALOGUE_CACHE_DEFAULTS },
    CatalogueCache,
    CatalogueVersionReader,
    PublicCatalogue,
    ClientIp,
    ApiKeyAuthenticator,
    ApiKeyService,
    ApiKeyEraser,
    RequestLimits,
    RequestQuota,
    PublicKeyGuard,
    PublicApiHost,
  ],
  exports: [ApiKeyService, ApiKeyEraser, PublicApiHost, RequestQuota],
})
export class PublicApiModule {}
