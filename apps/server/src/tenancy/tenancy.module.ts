import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { DatabaseService } from '../database/database.service';
import { ENV } from '../config/tokens';
import { TenantCache } from './tenant-cache';
import { DrizzleSlugAvailability, DrizzleTenantDirectory } from './tenant-directory';
import { TenantGuard } from './tenant.guard';
import { TenantResolver } from './tenant-resolver.service';
import { SlugService } from './slug.service';
import {
  PLATFORM_DOMAIN,
  SLUG_AVAILABILITY,
  TENANT_DIRECTORY,
  TRUSTED_EDGE_SECRET,
} from './tokens';
import type { Env } from '../config/env';

// TEN-7a: the tenant guard runs on every route, before any authentication code (APP_GUARD).
@Module({
  providers: [
    { provide: TenantCache, useFactory: () => new TenantCache() },
    {
      provide: TENANT_DIRECTORY,
      inject: [DatabaseService],
      useFactory: (database: DatabaseService) => new DrizzleTenantDirectory(database.handle.db),
    },
    {
      provide: PLATFORM_DOMAIN,
      inject: [ENV],
      useFactory: (env: Env) => env.PLATFORM_DOMAIN,
    },
    {
      provide: TRUSTED_EDGE_SECRET,
      inject: [ENV],
      useFactory: (env: Env) => env.TRUSTED_EDGE_SECRET,
    },
    {
      provide: SLUG_AVAILABILITY,
      inject: [DatabaseService],
      useFactory: (database: DatabaseService) => new DrizzleSlugAvailability(database.handle.db),
    },
    TenantResolver,
    SlugService,
    { provide: APP_GUARD, useClass: TenantGuard },
  ],
  exports: [TenantResolver, SlugService],
})
export class TenancyModule {}
