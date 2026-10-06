import { Inject, Injectable } from '@nestjs/common';
import { ChallengeChannel, ChallengeKind, SignInMethod } from '@lytronix/validators';
import type { Transaction } from '@lytronix/db';
import { ApiError } from '../../../common/api-error';
import { UniqueViolation } from '../../../common/errors/unique-violation';
import { EmailFormat } from './email-format';
import { OneTimeCodeService } from './one-time-code.service';
import { SignInLockout } from './sign-in-lockout';
import { SignedInSession } from './signed-in-session';
import type { SessionContext } from '../types/session';
import type { SignedIn } from '../types/signed-in';
import { SIGNUP_GATEWAY } from '../tokens';
import type { SignupGateway } from '../ports/signup-gateway';

/** Sign-in and sign-up by an emailed code (AUTH-08, AUTH-24). A new address creates an account with no password. */
@Injectable()
export class EmailSigninService {
  constructor(
    @Inject(OneTimeCodeService) private readonly codes: OneTimeCodeService,
    @Inject(SIGNUP_GATEWAY) private readonly gateway: SignupGateway,
    @Inject(SignedInSession) private readonly signedIn: SignedInSession,
    @Inject(SignInLockout) private readonly lockout: SignInLockout,
    @Inject(EmailFormat) private readonly emailFormat: EmailFormat,
  ) {}

  requestCode(rawEmail: string) {
    return this.codes.issue(
      this.requireEmail(rawEmail),
      ChallengeChannel.Email,
      ChallengeKind.Signin,
    );
  }

  async verifyCode(rawEmail: string, code: string, context: SessionContext): Promise<SignedIn> {
    const email = this.requireEmail(rawEmail);
    const existing = await this.gateway.run((tx) => this.gateway.findSubscriberByEmail(tx, email));
    const subscriberId = existing?.subscriberId ?? null;
    await this.lockout.refuseIfLocked(subscriberId);

    let challengeId: string;
    try {
      challengeId = await this.codes.verify(
        email,
        ChallengeChannel.Email,
        code,
        ChallengeKind.Signin,
      );
    } catch (error) {
      if (error instanceof ApiError && error.code === 'validation_error') {
        await this.lockout.recordFailure(subscriberId, context.ip);
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
        const accountId = subscriberId ?? (await this.createAccount(tx, email));
        return this.signedIn.open(tx, {
          subscriberId: accountId,
          signInMethod: SignInMethod.Code,
          mustSetPassword: false,
          context,
        });
      });
    } catch (error) {
      if (error instanceof UniqueViolation) throw new ApiError('conflict', 'Please try again.', {});
      throw error;
    }
  }

  private async createAccount(tx: Transaction, email: string): Promise<string> {
    const subscriberId = await this.gateway.insertSubscriber(tx);
    await this.gateway.insertEmailIdentity(tx, { subscriberId, email, verifiedAt: new Date() });
    return subscriberId;
  }

  private requireEmail(raw: string): string {
    const email = this.emailFormat.normalize(raw);
    if (!email) {
      throw new ApiError('validation_error', 'Enter a valid email address.', { field: 'email' });
    }
    return email;
  }
}
