import { Inject, Injectable } from '@nestjs/common';
import { ChallengeChannel, ChallengeKind, SignInMethod } from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { OneTimeCodeService, CODE_TTL_MS, RESET_COOLDOWN_MS } from './one-time-code.service';
import { PhoneNumberFormat } from './phone-number-format';
import { SignInLockout } from './sign-in-lockout';
import { SignedInSession } from './signed-in-session';
import type { SessionContext } from '../types/session';
import type { SignedIn } from '../types/signed-in';
import { SIGNUP_GATEWAY } from '../tokens';
import type { SignupGateway } from '../ports/signup-gateway';
import type { CodeIssued } from '../types/code-issued';

/** Forgot-password by reset code (AUTH-17, AUTH-18, AUTH-19). */
@Injectable()
export class ForgotPasswordService {
  constructor(
    @Inject(SIGNUP_GATEWAY) private readonly gateway: SignupGateway,
    @Inject(OneTimeCodeService) private readonly codes: OneTimeCodeService,
    @Inject(SignInLockout) private readonly lockout: SignInLockout,
    @Inject(SignedInSession) private readonly signedIn: SignedInSession,
    @Inject(PhoneNumberFormat) private readonly phoneFormat: PhoneNumberFormat,
  ) {}

  async request(rawPhone: string): Promise<CodeIssued> {
    const phone = this.phoneFormat.normalize(rawPhone);
    const account = phone
      ? await this.gateway.run((tx) => this.gateway.findSubscriberByPhone(tx, phone))
      : null;
    if (phone && account) {
      try {
        await this.codes.issue(phone, ChallengeChannel.Sms, ChallengeKind.Reset, RESET_COOLDOWN_MS);
      } catch (error) {
        // A refused or undelivered reset code gets the same reply as success, so the caller learns nothing.
        if (!(error instanceof ApiError)) throw error;
      }
    }
    return { expiresInSeconds: CODE_TTL_MS / 1000, resendAfterSeconds: RESET_COOLDOWN_MS / 1000 };
  }

  async verify(rawPhone: string, code: string, context: SessionContext): Promise<SignedIn> {
    const phone = this.phoneFormat.normalize(rawPhone);
    const account = phone
      ? await this.gateway.run((tx) => this.gateway.findSubscriberByPhone(tx, phone))
      : null;
    const subscriberId = account?.subscriberId ?? null;
    await this.lockout.refuseIfLocked(subscriberId);
    if (!phone || !account) {
      await this.lockout.recordFailure(null, context.ip);
      throw this.invalidCode();
    }

    let challengeId: string;
    try {
      challengeId = await this.codes.verify(phone, ChallengeChannel.Sms, code, ChallengeKind.Reset);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'validation_error') {
        await this.lockout.recordFailure(account.subscriberId, context.ip);
      }
      throw error;
    }

    return this.gateway.run(async (tx) => {
      const consumed = await this.gateway.consumeChallenge(tx, challengeId, new Date());
      if (!consumed) throw this.invalidCode();
      return this.signedIn.open(tx, {
        subscriberId: account.subscriberId,
        signInMethod: SignInMethod.Reset,
        mustSetPassword: true,
        context,
      });
    });
  }

  /** The same reply for a wrong, expired or unknown code (AUTH-17). */
  private invalidCode(): ApiError {
    return new ApiError('validation_error', 'This code is not valid. Request a new one.', {
      field: 'code',
    });
  }
}
