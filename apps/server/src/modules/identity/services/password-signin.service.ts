import { Inject, Injectable } from '@nestjs/common';
import { SignInMethod } from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { PasswordHasher } from './password-hasher';
import { PhoneNumberFormat } from './phone-number-format';
import { SignInLockout } from './sign-in-lockout';
import { type SignedIn, SignedInSession } from './signed-in-session';
import type { SessionContext } from './session.service';
import { SIGNUP_GATEWAY } from '../tokens';
import type { SignupGateway } from '../ports/signup-gateway';

// AUTH-13: one reply for an unknown number, an account with no password and a wrong password.
const INVALID = (): ApiError =>
  new ApiError('unauthenticated', 'That phone number and password do not match.', {});

/** Sign-in with phone and password (AUTH-12, AUTH-13, AUTH-14). */
@Injectable()
export class PasswordSigninService {
  constructor(
    @Inject(SIGNUP_GATEWAY) private readonly gateway: SignupGateway,
    @Inject(SignedInSession) private readonly signedIn: SignedInSession,
    @Inject(SignInLockout) private readonly lockout: SignInLockout,
    @Inject(PasswordHasher) private readonly hasher: PasswordHasher,
    @Inject(PhoneNumberFormat) private readonly phoneFormat: PhoneNumberFormat,
  ) {}

  async signIn(rawPhone: string, password: string, context: SessionContext): Promise<SignedIn> {
    const phone = this.phoneFormat.normalize(rawPhone);
    const account = phone
      ? await this.gateway.run((tx) => this.gateway.findSubscriberByPhone(tx, phone))
      : null;
    const subscriberId = account?.subscriberId ?? null;
    await this.lockout.refuseIfLocked(subscriberId);

    const matches =
      account?.passwordHash != null
        ? await this.hasher.verify(password, account.passwordHash)
        : await this.hasher.verifyAbsent(password);
    if (!account || !matches) {
      await this.lockout.recordFailure(subscriberId, context.ip);
      throw INVALID();
    }

    return this.gateway.run((tx) =>
      this.signedIn.open(tx, {
        subscriberId: account.subscriberId,
        signInMethod: SignInMethod.Password,
        mustSetPassword: false,
        context,
      }),
    );
  }
}
