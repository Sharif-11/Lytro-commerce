import { Inject, Injectable } from '@nestjs/common';
import { ApiError } from '../../../common/api-error';
import { MINUTE_MS } from '../../../common/time';
import { SIGN_IN_FAILURE_STORE } from '../tokens';
import type { SignInFailureStore } from '../ports/sign-in-failure-store';

// AUTH-14: five failed sign-ins within fifteen minutes lock the account.
export const SIGNIN_MAX_FAILURES = 5;
export const SIGNIN_WINDOW_MS = 15 * MINUTE_MS;

/** The sliding-window sign-in lock, shared by code, password, reset and password-change checks. */
@Injectable()
export class SignInLockout {
  constructor(@Inject(SIGN_IN_FAILURE_STORE) private readonly failures: SignInFailureStore) {}

  async refuseIfLocked(subscriberId: string | null): Promise<void> {
    if (subscriberId === null) return;
    const since = new Date(Date.now() - SIGNIN_WINDOW_MS);
    if ((await this.failures.countSince({ subscriberId }, since)) >= SIGNIN_MAX_FAILURES) {
      throw new ApiError(
        'rate_limited',
        'Too many failed sign-ins. Wait before trying again.',
        {},
        SIGNIN_WINDOW_MS / 1000,
      );
    }
  }

  recordFailure(subscriberId: string | null, ip: string | null): Promise<void> {
    return this.failures.record({ subscriberId, ip });
  }
}
