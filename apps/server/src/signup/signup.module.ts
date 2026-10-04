import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ENV } from '../config/tokens';
import { DatabaseService } from '../database/database.service';
import { ApiErrorFilter } from '../common/api-error.filter';
import { TenancyModule } from '../tenancy/tenancy.module';
import { SignupController } from './signup.controller';
import { SignupService } from './signup.service';
import { CLOCK, OTP_SECRET, SHOP_URL, SIGNUP_STORE } from './tokens';
import { DrizzleSignupStore } from './signup.store';
import type { Env } from '../config/env';

@Module({
  imports: [TenancyModule],
  controllers: [SignupController],
  providers: [
    {
      provide: SIGNUP_STORE,
      inject: [DatabaseService],
      useFactory: (database: DatabaseService) => new DrizzleSignupStore(database.handle.db),
    },
    { provide: CLOCK, useValue: (): Date => new Date() },
    { provide: OTP_SECRET, inject: [ENV], useFactory: (env: Env) => env.OTP_SECRET },
    {
      provide: SHOP_URL,
      inject: [ENV],
      useFactory: (env: Env) => (address: string) =>
        `${env.NODE_ENV === 'production' ? 'https' : 'http'}://${address}.${env.PLATFORM_DOMAIN}`,
    },
    SignupService,
    { provide: APP_FILTER, useClass: ApiErrorFilter },
  ],
})
export class SignupModule {}
