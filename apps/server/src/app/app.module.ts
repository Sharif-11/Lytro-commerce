import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ApiErrorFilter } from '../common/api-error.filter';
import { DatabaseModule } from '../database/database.module';
import { HealthController } from '../modules/health/health.controller';
import { IdentityModule } from '../modules/identity/identity.module';
import { TenancyModule } from '../modules/tenancy/tenancy.module';

@Module({
  imports: [DatabaseModule, TenancyModule, IdentityModule],
  controllers: [HealthController],
  providers: [{ provide: APP_FILTER, useClass: ApiErrorFilter }],
})
export class AppModule {}
