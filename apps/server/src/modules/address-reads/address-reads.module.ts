import { Module } from '@nestjs/common';
import type { Env } from '../../config/env';
import { ENV } from '../../config/tokens';
import { DrizzleAddressReadStore } from '../../database/adapters/address-reads.adapter';
import { BalanceModule } from '../balance/balance.module';
import { DeliveryModule } from '../delivery/delivery.module';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module';
import { OutsideCalls } from '../shared/outside-calls/services/outside-calls';
import { addressReadersFor } from './providers/address-reader-choice';
import type { AiFetch } from './providers/gemini-address-reader';
import { AddressReads } from './services/address-reads';
import { ADDRESS_READ_CLOCK, ADDRESS_READ_STORE, ADDRESS_READERS, AI_FETCH } from './tokens';

// ORD-30 to ORD-34, PLN-20 (Phase 7 Slice 7.6): reading a customer's delivery details from a pasted message. D7-22: the
// reader follows the server's mode -- the stand-in in tests and development unless forced, Gemini in production.
@Module({
  imports: [BalanceModule, DeliveryModule, PlatformSettingsModule],
  providers: [
    { provide: ADDRESS_READ_STORE, useClass: DrizzleAddressReadStore },
    {
      provide: AI_FETCH,
      useValue: ((input, init) => fetch(input, init)) satisfies AiFetch,
    },
    {
      provide: ADDRESS_READERS,
      inject: [ENV, AI_FETCH, OutsideCalls],
      useFactory: (env: Env, fetchAi: AiFetch, outside: OutsideCalls) =>
        addressReadersFor(env, fetchAi, outside.breaker('gemini')),
    },
    { provide: ADDRESS_READ_CLOCK, useValue: (): Date => new Date() },
    AddressReads,
  ],
  exports: [AddressReads],
})
export class AddressReadsModule {}
