import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import {
  LISTENER_HEARTBEATS_PER_HOUR,
  LISTENER_PAIR_FAIL_WINDOW_MINUTES,
  LISTENER_PAIR_FAILS_PER_IP,
  LISTENER_UPLOADS_PER_DEVICE_PER_MINUTE,
  LISTENER_UPLOADS_PER_SHOP_PER_MINUTE,
  LISTENER_VOLUME_PER_HOUR,
} from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { SlidingWindow } from '../../../common/sliding-window';
import { HOUR_MS, MINUTE_MS } from '../../../common/time';

// How often the windows drop buckets nobody is using.
const SWEEP_EVERY_MS = MINUTE_MS;

/**
 * LSN-10, LSN-13 (Phase 5 Slice 5.4a): the listener's windows, in memory -- a caller's failed pairings ([5] in [15]
 * minutes, only the failures counted), a phone's heartbeats ([4] an hour) and, since Slice 5.4b, uploads and the hourly
 * volume (LSN-14). Exact while there is one server (D3-2);
 * Phase 9 moves them to the shared Redis behind the same calls.
 */
@Injectable()
export class ListenerLimits implements OnModuleInit, OnModuleDestroy {
  private readonly pairFailures = new SlidingWindow(LISTENER_PAIR_FAIL_WINDOW_MINUTES * MINUTE_MS);
  private readonly heartbeats = new SlidingWindow(HOUR_MS);
  // Slice 5.4b: a phone's and a shop's uploads a minute, and a phone's messages an hour.
  private readonly uploads = new SlidingWindow(MINUTE_MS);
  private readonly volume = new SlidingWindow(HOUR_MS);
  private sweeper: NodeJS.Timeout | null = null;

  onModuleInit(): void {
    this.sweeper = setInterval(() => {
      const now = Date.now();
      this.pairFailures.sweep(now);
      this.heartbeats.sweep(now);
      this.uploads.sweep(now);
      this.volume.sweep(now);
    }, SWEEP_EVERY_MS);
    this.sweeper.unref();
  }

  onModuleDestroy(): void {
    if (this.sweeper) clearInterval(this.sweeper);
  }

  /** LSN-10: a caller that failed [5] pairings in the window tries no more until one leaves it. */
  refusePairing(ip: string, now: Date): void {
    const verdict = this.pairFailures.peek(`pair:${ip}`, LISTENER_PAIR_FAILS_PER_IP, now.getTime());
    if (!verdict.allowed) {
      throw new ApiError(
        'rate_limited',
        'ListenerTooManyTries',
        {},
        Math.ceil(verdict.resetMs / 1000),
      );
    }
  }

  failedPairing(ip: string, now: Date): void {
    this.pairFailures.take(`pair:${ip}`, LISTENER_PAIR_FAILS_PER_IP, now.getTime());
  }

  /** LSN-13: a phone's [4] heartbeats an hour. */
  admitHeartbeat(deviceId: string, now: Date): void {
    const verdict = this.heartbeats.take(
      `beat:${deviceId}`,
      LISTENER_HEARTBEATS_PER_HOUR,
      now.getTime(),
    );
    if (!verdict.allowed) {
      throw new ApiError('rate_limited', 'TooManyRequests', {}, Math.ceil(verdict.resetMs / 1000));
    }
  }

  /** LSN-13 (Slice 5.4b): a phone's [30] uploads a minute, and its shop's [120]. */
  admitUpload(deviceId: string, tenantId: string, now: Date): void {
    const at = now.getTime();
    const phone = this.uploads.take(
      `phone:${deviceId}`,
      LISTENER_UPLOADS_PER_DEVICE_PER_MINUTE,
      at,
    );
    const verdict = phone.allowed
      ? this.uploads.take(`shop:${tenantId}`, LISTENER_UPLOADS_PER_SHOP_PER_MINUTE, at)
      : phone;
    if (!verdict.allowed) {
      throw new ApiError('rate_limited', 'TooManyRequests', {}, Math.ceil(verdict.resetMs / 1000));
    }
  }

  /** LSN-14 (Slice 5.4b): these messages counted; whether the phone has now passed [500] in an hour. */
  overVolume(deviceId: string, count: number, now: Date): boolean {
    let over = false;
    for (let index = 0; index < count; index += 1) {
      const verdict = this.volume.take(deviceId, LISTENER_VOLUME_PER_HOUR, now.getTime());
      if (!verdict.allowed) over = true;
    }
    return over;
  }
}
