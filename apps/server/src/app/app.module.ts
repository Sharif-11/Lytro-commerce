import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ApiErrorFilter } from '../common/api-error.filter';
import { DatabaseModule } from '../database/database.module';
import { HealthController } from '../modules/health/health.controller';
import { ThrowTestController } from '../modules/health/throw-test.controller';
import { AuditModule } from '../modules/audit/audit.module';
import { QueueModule } from '../modules/shared/queue/queue.module';
import { QueueWorkersModule } from '../modules/shared/queue-workers/queue-workers.module';
import { TeamModule } from '../modules/team/team.module';
import { IdentityModule } from '../modules/identity/identity.module';
import { OperatorModule } from '../modules/operator/operator.module';
import { TenancyModule } from '../modules/tenancy/tenancy.module';
import { BillingModule } from '../modules/billing/billing.module';

@Module({
  imports: [
    DatabaseModule,
    TenancyModule,
    IdentityModule,
    OperatorModule,
    TeamModule,
    BillingModule,
    AuditModule,
    QueueModule,
    QueueWorkersModule,
  ],
  controllers:
    process.env['NODE_ENV'] === 'test'
      ? [HealthController, ThrowTestController]
      : [HealthController],
  providers: [{ provide: APP_FILTER, useClass: ApiErrorFilter }],
})
export class AppModule {}
