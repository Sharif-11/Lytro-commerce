import { Inject, Injectable } from '@nestjs/common';
import { ChallengeKind, SignInMethod } from '@lytronix/validators';
import type { Transaction } from '@lytronix/db';
import { ApiError } from '../../../common/api-error';
import { UniqueViolation } from '../../../common/errors/unique-violation';
import { OneTimeCodeService } from './one-time-code.service';
import { PhoneNumberFormat } from './phone-number-format';
import { SignInLockout } from './sign-in-lockout';
import { type SignedIn, SignedInSession } from './signed-in-session';
import type { SessionContext } from './session.service';
import { SIGNUP_GATEWAY } from '../tokens';
import type { SignupGateway } from '../ports/signup-gateway';

export type { SignedIn, NextStep } from './signed-in-session';

/**
 * Sign-in and sign-up by one-time code (AUTH-01, AUTH-04, AUTH-08, AUTH-12). A verified number opens a session on
 * the current host. A new number creates the subscriber in the same unit of work.
 */
@Injectable()
export class SigninService {
  constructor(
    @Inject(OneTimeCodeService) private readonly codes: OneTimeCodeService,
    @Inject(SIGNUP_GATEWAY) private readonly gateway: SignupGateway,
    @Inject(SignedInSession) private readonly signedIn: SignedInSession,
    @Inject(SignInLockout) private readonly lockout: SignInLockout,
    @Inject(PhoneNumberFormat) private readonly phoneFormat: PhoneNumberFormat,
  ) {}

  async requestCode(rawPhone: string) {
    return this.codes.issue(this.requirePhone(rawPhone), ChallengeKind.Signin);
  }

  async verifyCode(rawPhone: string, code: string, context: SessionContext): Promise<SignedIn> {
    const phone = this.requirePhone(rawPhone);
    const existing = await this.gateway.run((tx) => this.gateway.findSubscriberByPhone(tx, phone));
    await this.lockout.refuseIfLocked(existing?.subscriberId ?? null);

    let challengeId: string;
    try {
      challengeId = await this.codes.verify(phone, code, ChallengeKind.Signin);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'validation_error') {
        await this.lockout.recordFailure(existing?.subscriberId ?? null, context.ip);
      }
      throw error;
    }

    try {
      return await this.gateway.run(async (tx) => {
        const consumed = await this.gateway.consumeChallenge(tx, challengeId, new Date());
        if (!consumed) {
          throw new ApiError('validation_error', 'This code has already been used.', {
            field: 'code',
          });
        }
        const subscriberId = existing?.subscriberId ?? (await this.createAccount(tx, phone));
        return this.signedIn.open(tx, {
          subscriberId,
          signInMethod: SignInMethod.Code,
          mustSetPassword: false,
          context,
        });
      });
    } catch (error) {
      if (error instanceof UniqueViolation) {
        throw new ApiError('conflict', 'Please try again.', {});
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
      throw new ApiError(
        'validation_error',
        'Enter a Bangladeshi mobile number, such as 017XXXXXXXX.',
        { field: 'phone' },
      );
    }
    return phone;
  }
}
