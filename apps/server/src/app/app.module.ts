import { Module, type DynamicModule } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ZodSerializerInterceptor } from 'nestjs-zod';
import { GracefulShutdownModule } from '@tygra/nestjs-graceful-shutdown';
import { ApiErrorFilter } from '../common/api-error.filter';
import { ResponseEnvelopeInterceptor } from '../common/interceptors/response-envelope.interceptor';
import { DatabaseModule } from '../database/database.module';
import { HealthController } from '../modules/health/health.controller';
import { ThrowTestController } from '../modules/health/throw-test.controller';
import { AuditModule } from '../modules/audit/audit.module';
import { QueueModule } from '../modules/shared/queue/queue.module';
import { SecretsModule } from '../modules/shared/secrets/secrets.module';
import { QueueWorkersModule } from '../modules/shared/queue-workers/queue-workers.module';
import { TeamModule } from '../modules/team/team.module';
import { ShopAppModule } from '../modules/shop-app/shop-app.module';
import { IdentityModule } from '../modules/identity/identity.module';
import { OperatorModule } from '../modules/operator/operator.module';
import { TenancyModule } from '../modules/tenancy/tenancy.module';

// Every e2e spec boots its own AppModule instance via Test.createTestingModule -- registering
// GracefulShutdownModule's SIGTERM/SIGINT listeners there too would stack one pair per spec file
// (MaxListenersExceededWarning) and outlive each spec's own app.close(). Real process signals only
// matter for the one instance main.ts actually starts, so this is skipped in test mode, same as
// the controllers array below.
const shutdownImports: DynamicModule[] =
  process.env['NODE_ENV'] === 'test'
    ? []
    : [GracefulShutdownModule.forRoot({ gracefulShutdownTimeout: 10000 })];

@Module({
  imports: [
    ...shutdownImports,
    DatabaseModule,
    SecretsModule,
    TenancyModule,
    IdentityModule,
    OperatorModule,
    TeamModule,
    ShopAppModule,
    AuditModule,
    QueueModule,
    QueueWorkersModule,
  ],
  controllers:
    process.env['NODE_ENV'] === 'test'
      ? [HealthController, ThrowTestController]
      : [HealthController],
  providers: [
    { provide: APP_FILTER, useClass: ApiErrorFilter },
    // Order matters: ResponseEnvelopeInterceptor must wrap the already-validated value, so
    // ZodSerializerInterceptor (registered second, innermost) runs on the raw controller return first.
    { provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor },
    { provide: APP_INTERCEPTOR, useClass: ZodSerializerInterceptor },
  ],
})
export class AppModule {}
