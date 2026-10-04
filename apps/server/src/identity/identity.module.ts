import { Module } from '@nestjs/common';
import { ENV } from '../config/tokens';
import type { Env } from '../config/env';
import { DatabaseService } from '../database/database.service';
import { DrizzleChallengeStore, DrizzleSignupGateway } from '../database/adapters/identity.adapter';
import { MessagingModule } from '../messaging/messaging.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { PhoneSignupController } from './controllers/phone-signup.controller';
import { OneTimeCodeService } from './services/one-time-code.service';
import { PhoneSignupService } from './services/phone-signup.service';
import { PhoneNumberFormat } from './services/phone-number-format';
import { OneTimeCodeHasher } from './services/one-time-code-hasher';
import { CHALLENGE_STORE, OTP_SECRET, SIGNUP_GATEWAY, SIGNUP_SETTINGS } from './tokens';

@Module({
  imports: [TenancyModule, MessagingModule],
  controllers: [PhoneSignupController],
  providers: [
    { provide: CHALLENGE_STORE, useFactory: () => new DrizzleChallengeStore() },
    { provide: OTP_SECRET, inject: [ENV], useFactory: (env: Env) => env.OTP_SECRET },
    OneTimeCodeHasher,
    PhoneNumberFormat,
    {
      provide: SIGNUP_GATEWAY,
      inject: [DatabaseService],
      useFactory: (database: DatabaseService) => new DrizzleSignupGateway(database.handle.db),
    },
    {
      provide: SIGNUP_SETTINGS,
      inject: [ENV],
      useFactory: (env: Env) => ({
        now: (): Date => new Date(),
        shopUrl: (address: string): string =>
          `${env.NODE_ENV === 'production' ? 'https' : 'http'}://${address}.${env.PLATFORM_DOMAIN}`,
      }),
    },
    OneTimeCodeService,
    PhoneSignupService,
  ],
})
export class IdentityModule {}
