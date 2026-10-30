import { Module } from '@nestjs/common';
import { ENV } from '../../config/tokens';
import type { Env } from '../../config/env';
import { DrizzleShopperStore } from '../../database/adapters/shoppers.adapter';
import { BalanceModule } from '../balance/balance.module';
import { CatalogueModule } from '../catalogue/catalogue.module';
import { DeliveryModule } from '../delivery/delivery.module';
import { OneTimeCodeHasher } from '../identity/services/one-time-code-hasher';
import { PasswordHasher } from '../identity/services/password-hasher';
import { OTP_SECRET } from '../identity/tokens';
import { MessagingModule } from '../shared/messaging/messaging.module';
import { ShopperAccounts } from './services/shopper-accounts';
import { ShopperAddresses } from './services/shopper-addresses';
import { ShopperCodes } from './services/shopper-codes';
import { ShoppersEraser } from './services/shoppers-eraser';
import { SHOPPER_STORE, SHOPPERS_CLOCK } from './tokens';

// D4-12, D4-14 (Phase 4 Slice 4.4b): a shop's shoppers -- their accounts, sign-up codes, sign-ins and saved addresses.
// Kept apart from the customers module, which orders depend on, so that one stays free of the balance, SMS and
// password pieces this needs. It uses identity's code and password hashers (its own instances), the balance for the
// codes' cost, delivery's thana list, and catalogue's activity log writer.
@Module({
  imports: [BalanceModule, CatalogueModule, DeliveryModule, MessagingModule],
  providers: [
    { provide: SHOPPER_STORE, useClass: DrizzleShopperStore },
    { provide: SHOPPERS_CLOCK, useValue: () => new Date() },
    { provide: OTP_SECRET, inject: [ENV], useFactory: (env: Env) => env.OTP_SECRET },
    OneTimeCodeHasher,
    PasswordHasher,
    ShopperAccounts,
    ShopperAddresses,
    ShopperCodes,
    ShoppersEraser,
  ],
  exports: [ShopperAccounts, ShopperAddresses, ShopperCodes, ShoppersEraser],
})
export class ShoppersModule {}
