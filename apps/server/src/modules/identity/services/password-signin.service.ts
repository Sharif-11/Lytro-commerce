import { Inject, Injectable } from '@nestjs/common';
import { AuditAction, AuditResult, SignInMethod } from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { PasswordHasher } from './password-hasher';
import { PhoneNumberFormat } from './phone-number-format';
import { SignInAudit } from './sign-in-audit';
import { SignInLockout } from './sign-in-lockout';
import { SignedInSession } from './signed-in-session';
import type { SessionContext } from '../types/session';
import type { SignedIn } from '../types/signed-in';
import { SIGNUP_GATEWAY } from '../tokens';
import type { SignupGateway } from '../ports/signup-gateway';

/** Sign-in with phone and password (AUTH-12, AUTH-13, AUTH-14). */
@Injectable()
export class PasswordSigninService {
  constructor(
    @Inject(SIGNUP_GATEWAY) private readonly gateway: SignupGateway,
    @Inject(SignedInSession) private readonly signedIn: SignedInSession,
    @Inject(SignInLockout) private readonly lockout: SignInLockout,
    @Inject(PasswordHasher) private readonly hasher: PasswordHasher,
    @Inject(PhoneNumberFormat) private readonly phoneFormat: PhoneNumberFormat,
    @Inject(SignInAudit) private readonly signInAudit: SignInAudit,
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
      if (subscriberId !== null) {
        const owned = await this.gateway.run((tx) =>
          this.gateway.findOwnedTenant(tx, subscriberId),
        );
        await this.signInAudit.log(
          owned?.id ?? null,
          null,
          AuditAction.SignInFailed,
          AuditResult.Failure,
        );
      }
      throw this.invalidCredentials();
    }

    const opened = await this.gateway.run((tx) =>
      this.signedIn.open(tx, {
        subscriberId: account.subscriberId,
        signInMethod: SignInMethod.Password,
        mustSetPassword: false,
        context,
      }),
    );
    await this.signInAudit.log(opened.tenantId, null, AuditAction.SignIn, AuditResult.Success);
    return opened;
  }

  /** One reply for an unknown number, an account with no password and a wrong password (AUTH-13). */
  private invalidCredentials(): ApiError {
    return new ApiError('unauthenticated', 'That phone number and password do not match.', {});
  }
}
