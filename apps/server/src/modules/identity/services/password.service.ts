import { Inject, Injectable } from '@nestjs/common';
import {
  AuditAction,
  AuditResult,
  SignInMethod,
  type SetPasswordInput,
} from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { MINUTE_MS } from '../../../common/time';
import { PasswordHasher } from './password-hasher';
import { SessionService } from './session.service';
import { SignInAudit } from './sign-in-audit';
import { SignInLockout } from './sign-in-lockout';
import { SIGNUP_GATEWAY, SIGNUP_SETTINGS } from '../tokens';
import type { SessionRecord } from '../ports/session-store';
import type { SignupGateway } from '../ports/signup-gateway';
import type { SignupSettings } from '../ports/signup-settings';

// AUTH-20: a code sign-in this recent lets the owner set a password without the current one.
export const RECENT_CODE_MS = 10 * MINUTE_MS;

/** Sets or changes the password for the subscriber behind a session (AUTH-19, AUTH-20, D2). */
@Injectable()
export class PasswordService {
  constructor(
    @Inject(SIGNUP_GATEWAY) private readonly gateway: SignupGateway,
    @Inject(SIGNUP_SETTINGS) private readonly clock: SignupSettings,
    @Inject(PasswordHasher) private readonly hasher: PasswordHasher,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(SignInLockout) private readonly lockout: SignInLockout,
    @Inject(SignInAudit) private readonly signInAudit: SignInAudit,
  ) {}

  async set(session: SessionRecord, input: SetPasswordInput): Promise<void> {
    const account = await this.gateway.run((tx) =>
      this.gateway.findSubscriberById(tx, session.subscriberId),
    );
    const current = account?.passwordHash ?? null;
    if (current !== null && !this.currentNotNeeded(session)) {
      await this.lockout.refuseIfLocked(session.subscriberId);
      await this.checkCurrent(session, current, input.currentPassword);
    }

    const passwordHash = await this.hasher.hash(input.newPassword);
    await this.gateway.run(async (tx) => {
      await this.gateway.setPasswordHash(tx, session.subscriberId, passwordHash);
      await this.sessions.completePasswordChange(tx, session);
    });
    await this.signInAudit.log(
      session.tenantId,
      null,
      AuditAction.PasswordChanged,
      AuditResult.Success,
    );
  }

  private currentNotNeeded(session: SessionRecord): boolean {
    if (session.mustSetPassword) return true;
    const age = this.clock.now().getTime() - session.createdAt.getTime();
    return session.signInMethod === SignInMethod.Code && age <= RECENT_CODE_MS;
  }

  private async checkCurrent(
    session: SessionRecord,
    current: string,
    typed: string | undefined,
  ): Promise<void> {
    if (typed === undefined || typed === '') {
      throw new ApiError('validation_error', 'Enter your current password.', {
        field: 'currentPassword',
      });
    }
    if (await this.hasher.verify(typed, current)) return;
    await this.lockout.recordFailure(session.subscriberId, session.ip);
    throw new ApiError('validation_error', 'Your current password is not correct.', {
      field: 'currentPassword',
    });
  }
}
