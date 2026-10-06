import { Module } from '@nestjs/common';
import { ENV } from '../../config/tokens';
import type { Env } from '../../config/env';
import {
  DrizzleChallengeStore,
  DrizzleSignupGateway,
} from '../../database/adapters/identity.adapter';
import { DrizzleSessionStore } from '../../database/adapters/session.adapter';
import { DrizzleSignInFailureStore } from '../../database/adapters/sign-in-failure.adapter';
import { MailModule } from '../shared/mail/mail.module';
import { MessagingModule } from '../shared/messaging/messaging.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { AuthController } from './controllers/auth.controller';
import { MeController } from './controllers/me.controller';
import { ShopsController } from './controllers/shops.controller';
import { ClientIp } from '../../common/client-ip';
import { DashboardGuard } from './guards/dashboard.guard';
import { SessionGuard } from './guards/session.guard';
import { ForgotPasswordService } from './services/forgot-password.service';
import { OneTimeCodeService } from './services/one-time-code.service';
import { OneTimeCodeHasher } from './services/one-time-code-hasher';
import { PasswordHasher } from './services/password-hasher';
import { PasswordService } from './services/password.service';
import { PasswordSigninService } from './services/password-signin.service';
import { PhoneNumberFormat } from './services/phone-number-format';
import { SignInLockout } from './services/sign-in-lockout';
import { SignedInSession } from './services/signed-in-session';
import { SessionService } from './services/session.service';
import type { SessionSettings } from './types/session';
import { ShopCreationService } from './services/shop-creation.service';
import { SigninService } from './services/signin.service';
import {
  CHALLENGE_STORE,
  OTP_SECRET,
  SESSION_SETTINGS,
  SIGN_IN_FAILURE_STORE,
  SESSION_STORE,
  SIGNUP_GATEWAY,
  SIGNUP_SETTINGS,
} from './tokens';

@Module({
  imports: [TenancyModule, MessagingModule, MailModule],
  controllers: [AuthController, ShopsController, MeController],
  providers: [
    { provide: CHALLENGE_STORE, useClass: DrizzleChallengeStore },
    { provide: SESSION_STORE, useClass: DrizzleSessionStore },
    { provide: SIGN_IN_FAILURE_STORE, useClass: DrizzleSignInFailureStore },
    { provide: OTP_SECRET, inject: [ENV], useFactory: (env: Env) => env.OTP_SECRET },
    {
      provide: SESSION_SETTINGS,
      inject: [ENV],
      useFactory: (env: Env): SessionSettings => ({
        secureCookies: env.NODE_ENV === 'production',
      }),
    },
    OneTimeCodeHasher,
    PhoneNumberFormat,
    { provide: SIGNUP_GATEWAY, useClass: DrizzleSignupGateway },
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
    PasswordHasher,
    SessionService,
    SessionGuard,
    DashboardGuard,
    ClientIp,
    SignInLockout,
    SignedInSession,
    SigninService,
    PasswordSigninService,
    ForgotPasswordService,
    PasswordService,
    ShopCreationService,
  ],
})
export class IdentityModule {}
