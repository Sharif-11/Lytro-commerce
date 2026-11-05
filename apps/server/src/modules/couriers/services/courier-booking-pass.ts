import { Inject, Injectable, Logger } from '@nestjs/common';
import type { SelectCourierParcel } from '@lytronix/db';
import { CourierCallAction, ParcelState } from '@lytronix/validators';
import { MINUTE_MS } from '../../../common/time';
import type { LookUpAnswer } from '../ports/courier-adapter';
import type { CourierStore } from '../ports/courier-store';
import { COURIER_CLOCK, COURIER_STORE } from '../tokens';
import { CourierBooking, FIRST_LOOK_UP_AFTER_MS } from './courier-booking';
import { CourierCalls } from './courier-calls';
import { CourierConnections } from './courier-connections';
import { CourierNewsPath } from './courier-news-path';

// How many of a shop's parcels one pass looks at.
const PER_SHOP = 50;
// Asked again this often, this many times, before it is left to staff.
const LOOK_UP_EVERY_MS = 15 * MINUTE_MS;
const LOOK_UPS_MAX = 8;
// "No such parcel" twice, a while apart, before a booking counts as never made: a repeat is refused anyway if that is wrong.
const NOT_FOUND_TO_CLOSE = 2;

/** What one pass did. */
export interface CourierPassResult {
  shops: number;
  settled: number;
}

/**
 * D6-11, CRR-18 (Phase 6 Slice 6.1): the minute pass, for every shop not deleted. A `booking` older than any call can last means the
 * server died during it, so its answer is lost. A lost answer is asked after by our own number where the courier can be, so
 * it settles either way; one that can't be asked waits for staff. A parcel accepted but not settled is finished, unless it has a problem
 * for staff to clear. One shop's failure never stops the others, and a second pass finds nothing left to do.
 */
@Injectable()
export class CourierBookingPass {
  private readonly logger = new Logger('CourierBookingPass');

  constructor(
    @Inject(COURIER_STORE) private readonly store: CourierStore,
    @Inject(CourierBooking) private readonly booking: CourierBooking,
    @Inject(CourierConnections) private readonly connections: CourierConnections,
    @Inject(CourierCalls) private readonly calls: CourierCalls,
    @Inject(CourierNewsPath) private readonly news: CourierNewsPath,
    @Inject(COURIER_CLOCK) private readonly clock: () => Date,
  ) {}

  async runTick(): Promise<CourierPassResult> {
    const shops = await this.store.listShopIds();
    let settled = 0;
    for (const shopId of shops) {
      try {
        settled += await this.runShop(shopId);
      } catch (error) {
        this.logger.error(`the courier pass failed for tenant ${shopId}`, error as Error);
      }
    }
    return { shops: shops.length, settled };
  }

  private async runShop(tenantId: string): Promise<number> {
    const now = this.clock();
    const stuckBefore = new Date(now.getTime() - FIRST_LOOK_UP_AFTER_MS);
    // Slice 6.2: a message stored and not applied, say because the server restarted just after answering it.
    await this.news.applyDue(tenantId, new Date(now.getTime() - MINUTE_MS));
    const due = await this.store.run(tenantId, (tx) =>
      this.store.dueForPass(tx, tenantId, stuckBefore, now, PER_SHOP),
    );
    let settled = 0;
    for (const parcel of due) {
      try {
        if (parcel.state === ParcelState.Booking) {
          await this.nextLookUp(tenantId, parcel, {
            state: ParcelState.Unknown,
            nextLookUpAt: now,
          });
        } else if (parcel.state === ParcelState.Unknown) {
          if (await this.ask(tenantId, parcel)) settled += 1;
        } else {
          await this.booking.settleQuietly(tenantId, parcel);
          settled += 1;
        }
      } catch (error) {
        this.logger.error(`the courier pass failed on parcel ${parcel.id}`, error as Error);
      }
    }
    return settled;
  }

  /** D6-11: asks by our own number. True when that settled it, one way or the other. */
  private async ask(tenantId: string, parcel: SelectCourierParcel): Promise<boolean> {
    const opened = await this.store.run(tenantId, (tx) =>
      this.connections.openedWithin(tx, tenantId, parcel.courierKey),
    );
    const adapter = opened?.adapter;
    const lookUp = adapter?.lookUp?.bind(adapter);
    // A courier that can't be asked, or a connection that's gone, leaves it for staff to read from the panel.
    if (!opened || !adapter || !lookUp) {
      await this.nextLookUp(tenantId, parcel, { nextLookUpAt: null });
      return false;
    }
    const { account } = opened;
    const lookUps = parcel.lookUps + 1;
    let answer: LookUpAnswer;
    try {
      answer = await this.calls.run(
        adapter,
        {
          tenantId,
          connectionId: account.connectionId,
          orderId: parcel.orderId,
          action: CourierCallAction.LookUp,
        },
        () => lookUp(account, parcel.invoice),
      );
    } catch {
      // No answer, or the circuit is open: asked again later, until it is left to staff.
      await this.nextLookUp(tenantId, parcel, { lookUps, nextLookUpAt: this.laterOr(lookUps) });
      return false;
    }
    if (answer.outcome === 'found') {
      await this.booking.foundByLookUp(tenantId, parcel, answer);
      return true;
    }
    const notFound = parcel.notFound + 1;
    if (notFound >= NOT_FOUND_TO_CLOSE) {
      await this.booking.notBooked(tenantId, parcel);
      return true;
    }
    await this.nextLookUp(tenantId, parcel, {
      lookUps,
      notFound,
      nextLookUpAt: this.laterOr(lookUps),
    });
    return false;
  }

  private laterOr(lookUps: number): Date | null {
    if (lookUps >= LOOK_UPS_MAX) return null;
    return new Date(this.clock().getTime() + LOOK_UP_EVERY_MS);
  }

  private async nextLookUp(
    tenantId: string,
    parcel: SelectCourierParcel,
    patch: Parameters<CourierStore['updateParcel']>[3],
  ): Promise<void> {
    await this.store.run(tenantId, (tx) =>
      this.store.updateParcel(tx, tenantId, parcel.id, patch, this.clock()),
    );
  }
}
