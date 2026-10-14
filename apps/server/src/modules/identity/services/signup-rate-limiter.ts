import { Inject, Injectable } from '@nestjs/common';
import { ApiError } from '../../../common/api-error';
import { HOUR_MS } from '../../../common/time';
import { SIGNUP_ATTEMPT_STORE, SIGNUP_RATE_LIMIT_PER_IP } from '../tokens';
import type { SignupAttemptStore } from '../ports/signup-attempt-store';

export const SIGNUP_IP_WINDOW_MS = HOUR_MS;

/** Guards new-account creation (phone, email or OAuth sign-up) against one IP creating many accounts in an
    hour (SUP-08). A known, returning identity is never counted or refused — only genuine new accounts are.
    Requests with no known client IP (D14: no edge secret, or an unresolvable address) are never counted or
    refused either — the guard only works where the address is actually trustworthy. */
@Injectable()
export class SignupRateLimiter {
  constructor(
    @Inject(SIGNUP_ATTEMPT_STORE) private readonly attempts: SignupAttemptStore,
    @Inject(SIGNUP_RATE_LIMIT_PER_IP) private readonly cap: number,
  ) {}

  async refuseIfTooMany(ip: string | null): Promise<void> {
    if (ip === null) return;
    const since = new Date(Date.now() - SIGNUP_IP_WINDOW_MS);
    if ((await this.attempts.countSince(ip, since)) >= this.cap) {
      throw new ApiError('rate_limited', 'TooManySignups', {}, SIGNUP_IP_WINDOW_MS / 1000);
    }
  }

  record(ip: string | null): Promise<void> {
    if (ip === null) return Promise.resolve();
    return this.attempts.record(ip);
  }
}
