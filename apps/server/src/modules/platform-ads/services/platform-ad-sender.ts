import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { CircuitBreaker } from '../../../common/circuit-breaker';
import { OutsideCalls } from '../../shared/outside-calls/services/outside-calls';
import type { MetaConversions } from '../../shared/meta-conversions/ports/meta-conversions';
import { META_CONVERSIONS } from '../../shared/meta-conversions/tokens';
import type { PlatformAdStore } from '../ports/platform-ad-store';
import { PLATFORM_AD_SETTINGS, PLATFORM_AD_STORE } from '../tokens';
import type { PlatformAdJob } from '../types/platform-ad';
import { platformEventOf } from './platform-ad-event';
import type { PlatformAdSettings } from './platform-ad-settings';

// MKT-02: how often, and from how far apart (backing off), Meta is tried again for one of Lytro's events.
export const PLATFORM_AD_RETRIES = 8;
export const PLATFORM_AD_RETRY_DELAY_SECONDS = 60;

/**
 * MKT-02, MKT-05, PRF-05: tells Lytro's own pixel of a queued event, apart from what it is about. Settings removed since
 * it was queued send nothing. Calls go through the shared Meta circuit; each use of the token is logged by event, never
 * its value. A failure throws, and the job tries again.
 */
@Injectable()
export class PlatformAdSender {
  private readonly logger = new Logger('PlatformAdEvents');
  private readonly breaker: CircuitBreaker;

  constructor(
    @Inject(PLATFORM_AD_SETTINGS) private readonly settings: PlatformAdSettings,
    @Inject(PLATFORM_AD_STORE) private readonly store: PlatformAdStore,
    @Inject(META_CONVERSIONS) private readonly meta: MetaConversions,
    @Optional() @Inject(OutsideCalls) outside?: OutsideCalls,
  ) {
    this.breaker = outside?.breaker('meta') ?? new CircuitBreaker({ service: 'meta' });
  }

  async send(job: PlatformAdJob): Promise<void> {
    const { pixelId, accessToken, testEventCode } = this.settings;
    if (pixelId === null || accessToken === null) return;
    const ownerPhone =
      job.hashedPhone === null && job.tenantId !== null
        ? await this.store.ownerPhoneOf(job.tenantId)
        : null;
    const use = `Lytro's pixel, ${job.event} ${job.eventId}`;
    try {
      await this.breaker.call('meta:lytro', () =>
        this.meta.send(pixelId, accessToken, [platformEventOf(job, ownerPhone)], {
          ...(testEventCode !== null ? { testEventCode } : {}),
        }),
      );
      this.logger.log(`credential used: ${use}: sent`);
    } catch (error) {
      // The token travels in the request body only, so no error from the call can carry it.
      this.logger.warn(
        `credential used: ${use}: failed (${error instanceof Error ? error.message : 'error'})`,
      );
      throw error;
    }
  }
}
