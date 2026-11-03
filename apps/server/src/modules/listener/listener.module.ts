import { Module } from '@nestjs/common';
import { ClientIp } from '../../common/client-ip';
import { DrizzleListenerStore } from '../../database/adapters/listener.adapter';
import { AuditModule } from '../audit/audit.module';
import { BalanceModule } from '../balance/balance.module';
import { CatalogueModule } from '../catalogue/catalogue.module';
import { PaymentMethodsModule } from '../payment-methods/payment-methods.module';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { UsageWarningsModule } from '../usage-warnings/usage-warnings.module';
import { ListenerAppController } from './controllers/listener-app.controller';
import { ListenerDeviceGuard } from './guards/listener-device.guard';
import { ConsoleListenerNotifier } from './services/console-listener-notifier';
import { ListenerApp } from './services/listener-app';
import { ListenerDevices } from './services/listener-devices';
import { ListenerLimits } from './services/listener-limits';
import { ListenerPairing } from './services/listener-pairing';
import { ListenerRules } from './services/listener-rules';
import { LISTENER_CLOCK, LISTENER_NOTIFIER, LISTENER_STORE } from './tokens';

// LSN-01 to LSN-23 (Phase 5 Slice 5.4a): the listener phones a shop pairs to forward its payment SMS -- their codes,
// devices and tokens, the app's own routes, and Lytro's view and blocks. It reads the shop's limits (usage warnings),
// the platform's settings, and writes the activity and platform logs; the team's routes, the purge and the day-60
// deletion read it. The receipts sit above it, in ListenerReceiptsModule (Slice 5.4b). TenancyModule is imported only
// for ClientIp's EdgeSecret, as the operator module does.
@Module({
  imports: [
    AuditModule,
    BalanceModule,
    CatalogueModule,
    PaymentMethodsModule,
    PlatformSettingsModule,
    TenancyModule,
    UsageWarningsModule,
  ],
  controllers: [ListenerAppController],
  providers: [
    { provide: LISTENER_STORE, useClass: DrizzleListenerStore },
    { provide: LISTENER_NOTIFIER, useClass: ConsoleListenerNotifier },
    { provide: LISTENER_CLOCK, useValue: (): Date => new Date() },
    ClientIp,
    ListenerRules,
    ListenerLimits,
    ListenerPairing,
    ListenerDevices,
    ListenerApp,
    ListenerDeviceGuard,
  ],
  exports: [
    ListenerApp,
    ListenerDeviceGuard,
    ListenerDevices,
    ListenerLimits,
    ListenerPairing,
    ListenerRules,
    LISTENER_CLOCK,
    LISTENER_NOTIFIER,
    LISTENER_STORE,
  ],
})
export class ListenerModule {}
