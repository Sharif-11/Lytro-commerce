import { Module } from '@nestjs/common';
import { ClientIp } from '../../common/client-ip';
import {
  DrizzleApiKeyStore,
  DrizzleApiUsageStore,
} from '../../database/adapters/public-api.adapter';
import { CatalogueModule } from '../catalogue/catalogue.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { PublicShopController } from './controllers/public-shop.controller';
import { PublicKeyGuard } from './guards/public-key.guard';
import { ApiKeyAuthenticator } from './services/api-key-authenticator';
import { ApiKeyEraser } from './services/api-key-eraser';
import { ApiKeyService } from './services/api-key.service';
import { ConsoleRequestQuotaNotifier } from './services/console-request-quota-notifier';
import { PublicApiHost } from './services/public-api-host';
import { RequestLimits } from './services/request-limits';
import { RequestQuota } from './services/request-quota';
import { API_CLOCK, API_KEY_STORE, API_USAGE_STORE, REQUEST_QUOTA_NOTIFIER } from './tokens';

// D3-1, D3-2: the public API's keys and limits -- a shop's public keys, the gate every public API route sits behind
// (key, website, shop open, per-minute and per-cycle limits) and the API host itself. Depends on tenancy (hosts) and
// catalogue (the activity log a key's changes are written to); billing reaches it for the day-60 deletion.
@Module({
  imports: [TenancyModule, CatalogueModule],
  controllers: [PublicShopController],
  providers: [
    { provide: API_KEY_STORE, useClass: DrizzleApiKeyStore },
    { provide: API_USAGE_STORE, useClass: DrizzleApiUsageStore },
    { provide: REQUEST_QUOTA_NOTIFIER, useClass: ConsoleRequestQuotaNotifier },
    { provide: API_CLOCK, useValue: (): Date => new Date() },
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
