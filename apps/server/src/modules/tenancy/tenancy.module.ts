import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ENV } from '../../config/tokens';
import {
  DrizzleSlugAvailability,
  DrizzleTenantDirectory,
  DrizzleTenantStore,
  DrizzleTenantSummaryStore,
} from '../../database/adapters/tenancy.adapter';
import type { Env } from '../../config/env';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { EdgeSecret } from '../../common/guards/edge-secret';
import { MessagingModule } from '../shared/messaging/messaging.module';
import { StaffModule } from '../staff/staff.module';
import { TenantCache } from './services/tenant-cache';
import { HostClassifier } from './services/host-classifier';
import { SlugFormat } from './services/slug-format';
import { SlugService } from './services/slug.service';
import { TenantResolver } from './services/tenant-resolver.service';
import { TenantService } from './services/tenant.service';
import {
  CLOCK,
  PLATFORM_DOMAIN,
  SLUG_AVAILABILITY,
  TENANT_DIRECTORY,
  TENANT_STORE,
  TENANT_SUMMARY_STORE,
  TRUSTED_EDGE_SECRET,
} from './tokens';
import { TenantSummaries } from './services/tenant-summaries.service';

// TEN-7a: the tenant guard runs on every route, before any authentication code (APP_GUARD).
@Module({
  imports: [StaffModule, MessagingModule],
  providers: [
    { provide: TenantCache, useFactory: () => new TenantCache() },
    { provide: TENANT_DIRECTORY, useClass: DrizzleTenantDirectory },
    { provide: SLUG_AVAILABILITY, useClass: DrizzleSlugAvailability },
    { provide: TENANT_STORE, useClass: DrizzleTenantStore },
    { provide: TENANT_SUMMARY_STORE, useClass: DrizzleTenantSummaryStore },
    TenantSummaries,
    { provide: CLOCK, useValue: (): Date => new Date() },
    { provide: PLATFORM_DOMAIN, inject: [ENV], useFactory: (env: Env) => env.PLATFORM_DOMAIN },
    {
      provide: TRUSTED_EDGE_SECRET,
      inject: [ENV],
      useFactory: (env: Env) => env.TRUSTED_EDGE_SECRET,
    },
    SlugFormat,
    HostClassifier,
    EdgeSecret,
    TenantResolver,
    SlugService,
    TenantService,
    { provide: APP_GUARD, useClass: TenantGuard },
  ],
  exports: [
    TenantResolver,
    HostClassifier,
    SlugService,
    TenantService,
    TenantSummaries,
    EdgeSecret,
  ],
})
export class TenancyModule {}
