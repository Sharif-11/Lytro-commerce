import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ENV } from '../config/tokens';
import { DatabaseService } from '../database/database.service';
import {
  DrizzleSlugAvailability,
  DrizzleTenantDirectory,
  DrizzleTenantStore,
} from '../database/adapters/tenancy.adapter';
import type { Env } from '../config/env';
import { TenantGuard } from '../common/guards/tenant.guard';
import { MessagingModule } from '../messaging/messaging.module';
import { StaffModule } from '../staff/staff.module';
import { TenantCache } from './services/tenant-cache';
import { SlugService } from './services/slug.service';
import { TenantResolver } from './services/tenant-resolver.service';
import { TenantService } from './services/tenant.service';
import {
  CLOCK,
  PLATFORM_DOMAIN,
  SLUG_AVAILABILITY,
  TENANT_DIRECTORY,
  TENANT_STORE,
  TRUSTED_EDGE_SECRET,
} from './tokens';

// TEN-7a: the tenant guard runs on every route, before any authentication code (APP_GUARD).
@Module({
  imports: [StaffModule, MessagingModule],
  providers: [
    { provide: TenantCache, useFactory: () => new TenantCache() },
    {
      provide: TENANT_DIRECTORY,
      inject: [DatabaseService],
      useFactory: (database: DatabaseService) => new DrizzleTenantDirectory(database.handle.db),
    },
    {
      provide: SLUG_AVAILABILITY,
      inject: [DatabaseService],
      useFactory: (database: DatabaseService) => new DrizzleSlugAvailability(database.handle.db),
    },
    { provide: TENANT_STORE, useFactory: () => new DrizzleTenantStore() },
    { provide: CLOCK, useValue: (): Date => new Date() },
    { provide: PLATFORM_DOMAIN, inject: [ENV], useFactory: (env: Env) => env.PLATFORM_DOMAIN },
    {
      provide: TRUSTED_EDGE_SECRET,
      inject: [ENV],
      useFactory: (env: Env) => env.TRUSTED_EDGE_SECRET,
    },
    TenantResolver,
    SlugService,
    TenantService,
    { provide: APP_GUARD, useClass: TenantGuard },
  ],
  exports: [TenantResolver, SlugService, TenantService],
})
export class TenancyModule {}
