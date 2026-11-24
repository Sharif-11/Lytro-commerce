import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Transaction } from '@lytronix/db';
import { QueueName } from '@lytronix/validators';
import type { JobQueue } from '../../shared/queue/ports/job-queue';
import { JOB_QUEUE } from '../../shared/queue/tokens';
import { metaHash, metaPhoneOf } from '../../shared/meta-conversions/services/meta-user-data';
import type { PlatformAdStore } from '../ports/platform-ad-store';
import { PLATFORM_AD_SETTINGS, PLATFORM_AD_STORE } from '../tokens';
import { type AdVisit, PlatformAdEvent, type PlatformAdJob } from '../types/platform-ad';
import type { PlatformAdSettings } from './platform-ad-settings';

/**
 * MKT-02, MKT-04 (the owner, 2026-11-24): the one way an event of Lytro's own reaches its Meta pixel. Each is queued in
 * the transaction the event happened in, so it commits with it or not at all, and sent apart from it. A failure to queue
 * rolls back to a savepoint and is logged: it never fails the sign-up, the shop, the order or the payment (MKT-06).
 * Unset settings (staging, development) queue nothing.
 */
@Injectable()
export class PlatformAdEvents {
  private readonly logger = new Logger('PlatformAdEvents');
  // The shops' once-only events the database already holds, so a shop's every later order skips the savepoint. Added
  // only when the claim finds a committed row, never on a first claim, whose transaction may still roll back.
  private readonly alreadyTold = new Set<string>();

  constructor(
    @Inject(PLATFORM_AD_SETTINGS) private readonly settings: PlatformAdSettings,
    @Inject(JOB_QUEUE) private readonly jobs: JobQueue,
    @Inject(PLATFORM_AD_STORE) private readonly store: PlatformAdStore,
  ) {}

  /** `Lead`: a new account's phone code was accepted -- a sign-up, never a returning sign-in. */
  async signedUpWithin(
    tx: Transaction,
    who: { subscriberId: string; phone: string; visit: AdVisit | null },
  ): Promise<void> {
    await this.queueWithin(tx, null, {
      event: PlatformAdEvent.Lead,
      eventId: `lead-${who.subscriberId}`,
      tenantId: null,
      hashedPhone: metaHash(metaPhoneOf(who.phone)),
      hashedExternalId: metaHash(who.subscriberId),
      visit: who.visit,
      value: null,
    });
  }

  /** `CompleteRegistration`: the account made its shop. */
  async shopCreatedWithin(
    tx: Transaction,
    shop: { tenantId: string; subscriberId: string; phone: string; visit: AdVisit | null },
  ): Promise<void> {
    await this.queueWithin(tx, null, {
      event: PlatformAdEvent.CompleteRegistration,
      eventId: `registration-${shop.tenantId}`,
      tenantId: shop.tenantId,
      hashedPhone: metaHash(metaPhoneOf(shop.phone)),
      hashedExternalId: metaHash(shop.subscriberId),
      visit: shop.visit,
      value: null,
    });
  }

  /** `ShopActivated`: an order was made, so the shop has a product and an order -- told once, at its first. */
  async orderMadeWithin(tx: Transaction, tenantId: string): Promise<void> {
    await this.queueWithin(tx, tenantId, {
      event: PlatformAdEvent.ShopActivated,
      eventId: `activated-${tenantId}`,
      tenantId,
      hashedPhone: null,
      hashedExternalId: null,
      visit: null,
      value: null,
    });
  }

  /** `Subscribe`: a plan was paid for -- told once, at the shop's first, with its amount in taka. */
  async planPaidWithin(tx: Transaction, tenantId: string, amount: string): Promise<void> {
    await this.queueWithin(tx, tenantId, {
      event: PlatformAdEvent.Subscribe,
      eventId: `subscribe-${tenantId}`,
      tenantId,
      hashedPhone: null,
      hashedExternalId: null,
      visit: null,
      value: amount,
    });
  }

  /** Queues the event; `onceFor` names the shop whose event this may be only once (MKT-04). */
  private async queueWithin(
    tx: Transaction,
    onceFor: string | null,
    job: Omit<PlatformAdJob, 'eventTime'>,
  ): Promise<void> {
    if (!this.settings.enabled) return;
    const onceKey = onceFor !== null ? `${job.event}:${onceFor}` : null;
    if (onceKey !== null && this.alreadyTold.has(onceKey)) return;
    try {
      await tx.transaction(async (point) => {
        if (onceFor !== null && !(await this.store.claim(point, onceFor, job.event))) {
          if (onceKey !== null) this.alreadyTold.add(onceKey);
          return;
        }
        const queued: PlatformAdJob = { ...job, eventTime: Math.floor(Date.now() / 1000) };
        // No singleton key (the outbox's is an ID): the claim makes a shop's events once-only, a sign-up and a shop
        // happen once anyway, and Meta drops a repeat of the same event ID.
        await this.jobs.enqueue(point, QueueName.PlatformAdEvent, queued);
      });
    } catch (error) {
      // The database's own words (the cause), not the query the driver wraps them in.
      const reason =
        error instanceof Error
          ? (error.cause instanceof Error ? error.cause : error).message
          : 'error';
      this.logger.warn(`${job.event} not queued (${reason})`);
    }
  }
}
