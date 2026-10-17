import { Inject, Injectable } from '@nestjs/common';
import type { Transaction } from '@lytronix/db';
import { ApiError } from '../../../common/api-error';
import { DAY_MS } from '../../../common/time';
import {
  TRIAL_CREATION_STORE,
  TRIAL_LIMIT_PER_IDENTITY,
  TRIAL_LIMIT_PER_IP,
  TRIAL_LIMIT_WINDOW_DAYS,
} from '../tokens';
import type { TrialCreationStore } from '../ports/trial-creation-store';

/**
 * Guards trial-shop creation against one verified identity or one client IP creating too many trials
 * within a rolling window (AUTH-09). Tracks creation history, not current ownership, so deleting a tenant
 * and re-trialing on the same identity is still caught. One shared error for either axis -- deliberately
 * uninformative about which check failed, matching AUTH-13's "identical reply" philosophy. Requests with no
 * known client IP skip the IP check entirely, same carve-out SignupRateLimiter already uses.
 */
@Injectable()
export class TrialLimiter {
  constructor(
    @Inject(TRIAL_CREATION_STORE) private readonly store: TrialCreationStore,
    @Inject(TRIAL_LIMIT_PER_IDENTITY) private readonly identityCap: number,
    @Inject(TRIAL_LIMIT_PER_IP) private readonly ipCap: number,
    @Inject(TRIAL_LIMIT_WINDOW_DAYS) private readonly windowDays: number,
  ) {}

  async refuseIfTooMany(tx: Transaction, identityId: string, ip: string | null): Promise<void> {
    const since = new Date(Date.now() - this.windowDays * DAY_MS);
    const retryAfter = (this.windowDays * DAY_MS) / 1000;
    if ((await this.store.countByIdentitySince(tx, identityId, since)) >= this.identityCap) {
      throw new ApiError('rate_limited', 'TooManyTrials', {}, retryAfter);
    }
    if (ip !== null && (await this.store.countByIpSince(tx, ip, since)) >= this.ipCap) {
      throw new ApiError('rate_limited', 'TooManyTrials', {}, retryAfter);
    }
  }

  record(tx: Transaction, identityId: string, ip: string | null): Promise<void> {
    return this.store.record(tx, identityId, ip);
  }
}
