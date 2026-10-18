import { Inject, Injectable } from '@nestjs/common';
import {
  AuditAction,
  AuditResult,
  ChallengeChannel,
  ChallengeKind,
  LAPSED_TENANT_STATES,
  SignInMethod,
} from '@lytronix/validators';
import type { Transaction } from '@lytronix/db';
import { ApiError } from '../../../common/api-error';
import { UniqueViolation } from '../../../common/errors/unique-violation';
import { OneTimeCodeService } from './one-time-code.service';
import { PhoneNumberFormat } from './phone-number-format';
import { SignInAudit } from './sign-in-audit';
import { SignInLockout } from './sign-in-lockout';
import { SignupRateLimiter } from './signup-rate-limiter';
import { SignedInSession } from './signed-in-session';
import type { SessionContext } from '../types/session';
import type { SignedIn } from '../types/signed-in';
import { SIGNUP_GATEWAY } from '../tokens';
import type { SignupGateway } from '../ports/signup-gateway';

/** Sign-in and sign-up by one-time code (AUTH-01, AUTH-04, AUTH-08, AUTH-12). */
@Injectable()
export class SigninService {
  constructor(
    @Inject(OneTimeCodeService) private readonly codes: OneTimeCodeService,
    @Inject(SIGNUP_GATEWAY) private readonly gateway: SignupGateway,
    @Inject(SignedInSession) private readonly signedIn: SignedInSession,
    @Inject(SignInLockout) private readonly lockout: SignInLockout,
    @Inject(PhoneNumberFormat) private readonly phoneFormat: PhoneNumberFormat,
    @Inject(SignInAudit) private readonly signInAudit: SignInAudit,
    @Inject(SignupRateLimiter) private readonly signupLimit: SignupRateLimiter,
  ) {}

  async requestCode(rawPhone: string) {
    const phone = this.requirePhone(rawPhone);
    // AUTH-21: a known phone signing in by code is choosing that over its own password, so the code costs
    // that shop's essential-SMS allowance -- a brand-new phone (sign-up) has no shop yet to charge it to.
    const existing = await this.gateway.run((tx) => this.gateway.findSubscriberByPhone(tx, phone));
    const owned = existing
      ? await this.gateway.run((tx) => this.gateway.findOwnedTenant(tx, existing.subscriberId))
      : null;
    // LIF-10, SMS-04: in a lapsed shop the code is the platform letting the owner back in to restore it --
    // never counted toward the free allowance, never charged.
    const countedTo = owned && !LAPSED_TENANT_STATES.includes(owned.state) ? owned.id : null;
    return this.codes.issue(
      phone,
      ChallengeChannel.Sms,
      ChallengeKind.Signin,
      undefined,
      countedTo,
    );
  }

  async verifyCode(
    rawPhone: string,
    code: string,
    context: SessionContext,
  ): Promise<SignedIn & { suggestPassword: boolean }> {
    const phone = this.requirePhone(rawPhone);
    const existing = await this.gateway.run((tx) => this.gateway.findSubscriberByPhone(tx, phone));
    await this.lockout.refuseIfLocked(existing?.subscriberId ?? null);
    // SUP-08 only caps sign-up — a known phone is a returning sign-in and never counted or refused here,
    // however often this IP's own staff or owner sign in.
    if (!existing) {
      await this.signupLimit.refuseIfTooMany(context.ip);
    }

    let challengeId: string;
    try {
      challengeId = await this.codes.verify(
        phone,
        ChallengeChannel.Sms,
        code,
        ChallengeKind.Signin,
      );
    } catch (error) {
      if (error instanceof ApiError && error.code === 'validation_error') {
        await this.lockout.recordFailure(existing?.subscriberId ?? null, context.ip);
      }
      throw error;
    }

    try {
      const opened = await this.gateway.run(async (tx) => {
        const consumed = await this.gateway.consumeChallenge(tx, challengeId, new Date());
        if (!consumed) {
          throw new ApiError('validation_error', 'CodeAlreadyUsed', {
            field: 'code',
          });
        }
        const subscriberId = existing?.subscriberId ?? (await this.createAccount(tx, phone));
        // The code proves the number, so a pending staff phone becomes verified here (AUTH-08).
        await this.gateway.markPhoneVerified(tx, { subscriberId, phone, at: new Date() });
        return this.signedIn.open(tx, {
          subscriberId,
          signInMethod: SignInMethod.Code,
          mustSetPassword: false,
          context,
        });
      });
      await this.signInAudit.log(
        opened.tenantId,
        null,
        AuditAction.SignIn,
        AuditResult.Success,
        undefined,
        context.ip,
      );
      if (!existing) {
        await this.signupLimit.record(context.ip);
      }
      // AUTH-21: safe to reveal only now, after the code has proved phone ownership -- unlike the
      // request-code step (AUTH-13/P1-E10), there's no enumeration concern once the owner already knows
      // their own account exists.
      return { ...opened, suggestPassword: opened.tenantId !== null };
    } catch (error) {
      if (error instanceof UniqueViolation) {
        throw new ApiError('conflict', 'PleaseTryAgain', {});
      }
      throw error;
    }
  }

  private async createAccount(tx: Transaction, phone: string): Promise<string> {
    const subscriberId = await this.gateway.insertSubscriber(tx);
    await this.gateway.insertPhoneIdentity(tx, { subscriberId, phone, verifiedAt: new Date() });
    return subscriberId;
  }

  private requirePhone(raw: string): string {
    const phone = this.phoneFormat.normalize(raw);
    if (!phone) {
      throw new ApiError('validation_error', 'PhoneInvalid', { field: 'phone' });
    }
    return phone;
  }
}
