import { Inject, Injectable } from '@nestjs/common';
import { ChallengeChannel, ChallengeKind, SignInMethod } from '@lytronix/validators';
import type { Transaction } from '@lytronix/db';
import { ApiError } from '../../../common/api-error';
import { OneTimeCodeService, CODE_TTL_MS, RESET_COOLDOWN_MS } from './one-time-code.service';
import { EmailFormat } from './email-format';
import { PhoneNumberFormat } from './phone-number-format';
import { SignInLockout } from './sign-in-lockout';
import { SignedInSession } from './signed-in-session';
import type { SessionContext } from '../types/session';
import type { SignedIn } from '../types/signed-in';
import { SIGNUP_GATEWAY } from '../tokens';
import type { SignupGateway } from '../ports/signup-gateway';
import type { CodeIssued } from '../types/code-issued';

type Lookup = (tx: Transaction, destination: string) => Promise<{ subscriberId: string } | null>;

/** Forgot-password by reset code, sent to a verified phone (AUTH-17, AUTH-18, AUTH-19) or to a verified email (AUTH-27). */
@Injectable()
export class ForgotPasswordService {
  constructor(
    @Inject(SIGNUP_GATEWAY) private readonly gateway: SignupGateway,
    @Inject(OneTimeCodeService) private readonly codes: OneTimeCodeService,
    @Inject(SignInLockout) private readonly lockout: SignInLockout,
    @Inject(SignedInSession) private readonly signedIn: SignedInSession,
    @Inject(PhoneNumberFormat) private readonly phoneFormat: PhoneNumberFormat,
    @Inject(EmailFormat) private readonly emailFormat: EmailFormat,
  ) {}

  request(rawPhone: string): Promise<CodeIssued> {
    return this.requestFor(this.phoneFormat.normalize(rawPhone), ChallengeChannel.Sms, (tx, d) =>
      this.gateway.findSubscriberByPhone(tx, d),
    );
  }

  requestByEmail(rawEmail: string): Promise<CodeIssued> {
    return this.requestFor(this.emailFormat.normalize(rawEmail), ChallengeChannel.Email, (tx, d) =>
      this.gateway.findSubscriberByEmail(tx, d),
    );
  }

  verify(rawPhone: string, code: string, context: SessionContext): Promise<SignedIn> {
    return this.verifyFor(
      this.phoneFormat.normalize(rawPhone),
      ChallengeChannel.Sms,
      code,
      context,
      (tx, d) => this.gateway.findSubscriberByPhone(tx, d),
    );
  }

  verifyByEmail(rawEmail: string, code: string, context: SessionContext): Promise<SignedIn> {
    return this.verifyFor(
      this.emailFormat.normalize(rawEmail),
      ChallengeChannel.Email,
      code,
      context,
      (tx, d) => this.gateway.findSubscriberByEmail(tx, d),
    );
  }

  /** The same reply whether or not the destination has an account, so the caller learns nothing (AUTH-17). */
  private async requestFor(
    destination: string | null,
    channel: ChallengeChannel,
    lookup: Lookup,
  ): Promise<CodeIssued> {
    if (destination !== null) {
      const account = await this.gateway.run((tx) => lookup(tx, destination));
      if (account !== null) {
        try {
          await this.codes.issue(destination, channel, ChallengeKind.Reset, RESET_COOLDOWN_MS);
        } catch (error) {
          // A refused or undelivered reset code gets the same reply as success, so the caller learns nothing.
          if (!(error instanceof ApiError)) throw error;
        }
      }
    }
    return { expiresInSeconds: CODE_TTL_MS / 1000, resendAfterSeconds: RESET_COOLDOWN_MS / 1000 };
  }

  private async verifyFor(
    destination: string | null,
    channel: ChallengeChannel,
    code: string,
    context: SessionContext,
    lookup: Lookup,
  ): Promise<SignedIn> {
    const account =
      destination === null ? null : await this.gateway.run((tx) => lookup(tx, destination));
    await this.lockout.refuseIfLocked(account?.subscriberId ?? null);
    if (destination === null || account === null) {
      await this.lockout.recordFailure(null, context.ip);
      throw this.invalidCode();
    }

    let challengeId: string;
    try {
      challengeId = await this.codes.verify(destination, channel, code, ChallengeKind.Reset);
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
