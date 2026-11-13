import { Inject, Injectable } from '@nestjs/common';
import {
  LISTENER_HEARTBEATS_PER_HOUR,
  LISTENER_PAIR_FAIL_WINDOW_MINUTES,
  LISTENER_PAIR_FAILS_PER_IP,
  LISTENER_UPLOADS_PER_DEVICE_PER_MINUTE,
  LISTENER_UPLOADS_PER_SHOP_PER_MINUTE,
  LISTENER_VOLUME_PER_HOUR,
} from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { HOUR_MS, MINUTE_MS } from '../../../common/time';
import type { LimitStore } from '../../shared/limits/ports/limit-store';
import { ExactLimits } from '../../shared/limits/services/exact-limits';
import { LIMIT_STORE } from '../../shared/limits/tokens';

const PAIR_WINDOW_MS = LISTENER_PAIR_FAIL_WINDOW_MINUTES * MINUTE_MS;

/**
 * LSN-10, LSN-13, LSN-14 (Phase 5 Slices 5.4a and 5.4b; Slice 9.4): the listener's windows, one count for every API
 * copy and server. A caller's failed pairings ([5] in [15] minutes, only the failures counted) are exact, in
 * PostgreSQL (RED-11); a phone's heartbeats ([4] an hour), a phone's and a shop's uploads a minute, and a phone's
 * messages an hour are in the shared limit store (D9-15).
 */
@Injectable()
export class ListenerLimits {
  constructor(
    @Inject(LIMIT_STORE) private readonly store: LimitStore,
    @Inject(ExactLimits) private readonly exact: Pick<ExactLimits, 'take' | 'peek'>,
  ) {}

  /** LSN-10: a caller that failed [5] pairings in the window tries no more until one leaves it. */
  async refusePairing(ip: string, now: Date): Promise<void> {
    const verdict = await this.exact.peek(
      `listener-pair:${ip}`,
      LISTENER_PAIR_FAILS_PER_IP,
      PAIR_WINDOW_MS,
      now,
    );
    if (!verdict.allowed) {
      throw new ApiError(
        'rate_limited',
        'ListenerTooManyTries',
        {},
        Math.ceil(verdict.resetMs / 1000),
      );
    }
  }

  async failedPairing(ip: string, now: Date): Promise<void> {
    await this.exact.take(`listener-pair:${ip}`, LISTENER_PAIR_FAILS_PER_IP, PAIR_WINDOW_MS, now);
  }

  /** LSN-13: a phone's [4] heartbeats an hour. */
  async admitHeartbeat(deviceId: string, now: Date): Promise<void> {
    const verdict = await this.store.take(
      `listener:beat:${deviceId}`,
      LISTENER_HEARTBEATS_PER_HOUR,
      HOUR_MS,
      now,
    );
    if (!verdict.allowed) {
      throw new ApiError('rate_limited', 'TooManyRequests', {}, Math.ceil(verdict.resetMs / 1000));
    }
  }

  /** LSN-13 (Slice 5.4b): a phone's [30] uploads a minute, and its shop's [120]. */
  async admitUpload(deviceId: string, tenantId: string, now: Date): Promise<void> {
    const phone = await this.store.take(
      `listener:phone:${deviceId}`,
      LISTENER_UPLOADS_PER_DEVICE_PER_MINUTE,
      MINUTE_MS,
      now,
    );
    const verdict = phone.allowed
      ? await this.store.take(
          `listener:shop:${tenantId}`,
          LISTENER_UPLOADS_PER_SHOP_PER_MINUTE,
          MINUTE_MS,
          now,
        )
      : phone;
    if (!verdict.allowed) {
      throw new ApiError('rate_limited', 'TooManyRequests', {}, Math.ceil(verdict.resetMs / 1000));
    }
  }

  /** LSN-14 (Slice 5.4b): these messages counted; whether the phone has now passed [500] in an hour. */
  async overVolume(deviceId: string, count: number, now: Date): Promise<boolean> {
    let over = false;
    for (let index = 0; index < count; index += 1) {
      const verdict = await this.store.take(
        `listener:volume:${deviceId}`,
        LISTENER_VOLUME_PER_HOUR,
        HOUR_MS,
        now,
      );
      if (!verdict.allowed) over = true;
    }
    return over;
  }
}
