import { Inject, Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import type { SelectCourierConnection, SelectCourierPayout, Transaction } from '@lytronix/db';
import {
  CONSIGNMENT_ID_MAX_LENGTH,
  COURIER_PAYOUT_PAGE_SIZE,
  COURIER_PAYOUT_PAGES_PER_NIGHT,
  CourierCallAction,
  CourierConnectionState,
  DEFAULT_COURIER_CHECK_STOP_DAYS,
  LAPSED_TENANT_STATES,
  PlatformSettingKey,
  TenantState,
  type CourierKey,
  type CourierPayoutsQuery,
  type ParcelReading,
} from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { CircuitOpen } from '../../../common/circuit-breaker';
import { DAY_MS, MINUTE_MS } from '../../../common/time';
import { PlatformSettingsService } from '../../platform-settings/services/platform-settings.service';
import { TenantSummaries } from '../../tenancy/services/tenant-summaries.service';
import { CourierNoAnswer, type ListedPayout, type PaidParcel } from '../ports/courier-adapter';
import type { CourierStore } from '../ports/courier-store';
import { COURIER_CLOCK, COURIER_PAUSE, COURIER_STORE } from '../tokens';
import { CourierCalls } from './courier-calls';
import { CourierConnections, type OpenedConnection } from './courier-connections';

/** CRR-17: a payout as the shop sees it, the courier's figures as it gave them. */
export interface CourierPayoutView {
  id: string;
  courierKey: CourierKey;
  payoutId: string;
  amount: string;
  charges: string | null;
  total: string | null;
  method: string | null;
  paidAt: Date;
  madeAt: Date | null;
  /** How many parcels it settled, and how many of those Lytro booked. */
  parcels: number;
  ours: number;
}

/** CRR-17: one of the shop's orders a payout settled. No courier gives an amount for one parcel. */
export interface CourierPayoutOrderView {
  orderId: string;
  orderNumber: string | null;
  cod: string;
  cashCollected: string | null;
  deliveryCharge: string | null;
  reading: ParcelReading | null;
}

export interface CourierPayoutListView {
  payouts: CourierPayoutView[];
  page: number;
  limit: number;
  total: number;
  pages: number;
}

/** What one night's read of payouts did. */
export interface PayoutNightResult {
  shops: number;
  asked: number;
  payouts: number;
  parcels: number;
}

interface Tally {
  asked: number;
  payouts: number;
  parcels: number;
}

const ID = z.string().uuid();

function viewOf(row: SelectCourierPayout): CourierPayoutView {
  return {
    id: row.id,
    courierKey: row.courierKey,
    payoutId: row.payoutId,
    amount: row.amount,
    charges: row.charges,
    total: row.total,
    method: row.method,
    paidAt: row.paidAt,
    madeAt: row.madeAt,
    parcels: row.parcels,
    ours: row.ours,
  };
}

/**
 * CRR-17, D6-9 (Phase 6 Slice 6.5, read agreed 2026-11-06): what couriers paid the shop, kept as each courier tells it and shown, never
 * checked against the cash recorded, and never added up into what a courier owes. A courier that lists its payouts (Steadfast) is read
 * once a night after the check, on one server, until a real payout message proves it can be read from that instead. A shop is asked
 * only while one of that courier's finished parcels waits to be paid, so most nights cost nothing. Its list runs oldest first with no
 * page count, so the read starts on the page where new payouts may be, a page shorter than a full one is the last, and each payout not
 * yet read costs one more call, made only if it could hold a parcel still waiting. Its parcels take the payout's ID and paid date; the
 * payout keeps the amount, since no courier gives one for a parcel.
 */
@Injectable()
export class CourierPayouts {
  private readonly logger = new Logger('CourierPayouts');

  constructor(
    @Inject(COURIER_STORE) private readonly store: CourierStore,
    @Inject(CourierConnections) private readonly connections: CourierConnections,
    @Inject(CourierCalls) private readonly calls: CourierCalls,
    @Inject(PlatformSettingsService) private readonly settings: PlatformSettingsService,
    @Inject(TenantSummaries) private readonly shops: TenantSummaries,
    @Inject(COURIER_PAUSE) private readonly pause: (ms: number) => Promise<void>,
    @Inject(COURIER_CLOCK) private readonly clock: () => Date,
  ) {}

  /** The night's read, for every shop not deleted or lapsed. One shop's failure never stops the others. */
  async runNight(): Promise<PayoutNightResult> {
    const result: PayoutNightResult = { shops: 0, asked: 0, payouts: 0, parcels: 0 };
    for (const shopId of await this.store.listShopIds()) {
      try {
        const shop = await this.shops.findById(shopId);
        if (!shop || this.lapsed(shop.state)) continue;
        const done = await this.readShop(shopId);
        if (done.asked > 0) result.shops += 1;
        result.asked += done.asked;
        result.payouts += done.payouts;
        result.parcels += done.parcels;
      } catch (error) {
        this.logger.error(`reading payouts failed for tenant ${shopId}`, error as Error);
      }
    }
    return result;
  }

  /** CRR-17: the shop's payouts, the newest paid first. */
  list(tenantId: string, query: CourierPayoutsQuery): Promise<CourierPayoutListView> {
    const limit = COURIER_PAYOUT_PAGE_SIZE;
    return this.store.run(tenantId, async (tx) => {
      const found = await this.store.listPayouts(tx, tenantId, {
        courierKey: query.courierKey ?? null,
        offset: (query.page - 1) * limit,
        limit,
      });
      return {
        payouts: found.rows.map(viewOf),
        page: query.page,
        limit,
        total: found.total,
        pages: Math.ceil(found.total / limit),
      };
    });
  }

  /** CRR-17: one payout, with the shop's orders it settled. */
  one(
    tenantId: string,
    id: string,
  ): Promise<CourierPayoutView & { orders: CourierPayoutOrderView[] }> {
    return this.store.run(tenantId, async (tx) => {
      const row = ID.safeParse(id).success ? await this.store.findPayout(tx, tenantId, id) : null;
      if (!row) throw new ApiError('not_found', 'CourierPayoutNotFound', {});
      const orders = await this.store.payoutParcels(tx, tenantId, row);
      return { ...viewOf(row), orders };
    });
  }

  private lapsed(state: TenantState): boolean {
    return state === TenantState.Deleted || LAPSED_TENANT_STATES.includes(state);
  }

  private async readShop(tenantId: string): Promise<Tally> {
    const tally: Tally = { asked: 0, payouts: 0, parcels: 0 };
    const stopDays = await this.setting(
      PlatformSettingKey.CourierCheckStopDays,
      DEFAULT_COURIER_CHECK_STOP_DAYS,
    );
    // As the night check stops asking after a parcel with no change in this long, a payout stops being waited for.
    const changedSince = new Date(this.clock().getTime() - stopDays * DAY_MS);
    const rows = await this.store.run(tenantId, (tx) => this.store.listConnections(tx, tenantId));
    for (const row of rows) {
      if (row.state !== CourierConnectionState.Active) continue;
      const oldest = await this.store.run(tenantId, (tx) =>
        this.store.oldestUnpaid(tx, tenantId, row.courierKey, changedSince),
      );
      if (oldest === null) continue;
      if (!(await this.renewed(tenantId, row.courierKey))) continue;
      const opened = await this.store.run(tenantId, (tx) =>
        this.connections.openedWithin(tx, tenantId, row.courierKey),
      );
      if (!opened?.adapter.payouts || !opened.adapter.payout) continue;
      const done = await this.readConnection(tenantId, row, opened, oldest);
      tally.asked += done.asked;
      tally.payouts += done.payouts;
      tally.parcels += done.parcels;
    }
    return tally;
  }

  /**
   * One connection's pages, from where the last night left off. A page followed by another that isn't empty was full, which says how
   * many a page holds. Tomorrow starts on the first page with a payout not yet paid, otherwise the last that had any; if that page is
   * found empty, the list has changed under it and tomorrow starts again from the first.
   */
  private async readConnection(
    tenantId: string,
    connection: SelectCourierConnection,
    opened: OpenedConnection,
    oldest: Date,
  ): Promise<Tally> {
    const { adapter, account } = opened;
    const listPage = adapter.payouts?.bind(adapter);
    const readPayout = adapter.payout?.bind(adapter);
    const tally: Tally = { asked: 0, payouts: 0, parcels: 0 };
    if (!listPage || !readPayout) return tally;
    // A payout made up before the oldest parcel still waiting was booked can't hold it; a day's margin for its clock.
    const earliest = oldest.getTime() - DAY_MS;
    let page = connection.payoutPage;
    let pageSize = connection.payoutPageSize;
    let before: number | null = null;
    let lastWithAny: number | null = null;
    let firstUnpaid: number | null = null;
    let startAgain = false;
    let stop = false;
    for (let read = 0; read < COURIER_PAYOUT_PAGES_PER_NIGHT && !stop; read += 1) {
      const answer = await this.call(tenantId, opened, () => listPage(account, page));
      tally.asked += 1;
      if (answer === null || answer.outcome === 'refused') break;
      const listed = answer.payouts;
      if (listed.length === 0) {
        startAgain = lastWithAny === null && page > 1;
        break;
      }
      if (before !== null && pageSize === null) pageSize = before;
      lastWithAny = page;
      const known = await this.store.run(tenantId, (tx) =>
        this.store.knownPayouts(
          tx,
          tenantId,
          connection.courierKey,
          listed.map((payout) => payout.payoutId),
        ),
      );
      for (const payout of listed) {
        if (!payout.paid) {
          firstUnpaid ??= page;
          continue;
        }
        if (known.has(payout.payoutId)) continue;
        if (payout.madeAt !== null && payout.madeAt.getTime() < earliest) continue;
        const parcels = await this.call(tenantId, opened, () =>
          readPayout(account, payout.payoutId),
        );
        tally.asked += 1;
        if (parcels === null || parcels.outcome === 'refused') {
          stop = true;
          break;
        }
        if (parcels.outcome === 'not_found') continue;
        const ours = await this.keep(tenantId, connection.courierKey, payout, parcels.parcels);
        if (ours !== null) {
          tally.payouts += 1;
          tally.parcels += ours;
        }
      }
      if (listed.length < (pageSize ?? adapter.payoutPageAtLeast ?? Number.POSITIVE_INFINITY))
        break;
      before = listed.length;
      page += 1;
    }
    const nextPage = startAgain ? 1 : (firstUnpaid ?? lastWithAny ?? connection.payoutPage);
    if (nextPage !== connection.payoutPage || pageSize !== connection.payoutPageSize) {
      const now = this.clock();
      await this.store.run(tenantId, (tx) =>
        this.store.updateConnection(
          tx,
          tenantId,
          connection.id,
          { payoutPage: nextPage, payoutPageSize: pageSize },
          now,
        ),
      );
    }
    return tally;
  }

  /**
   * One payout, once: kept with its figures, and each of its parcels Lytro booked marked paid with its ID and date. A parcel is
   * matched by the courier's number, or by ours where Lytro never learned the courier's, which this then fills in. The first payout
   * to name a parcel stands. Null when it had been read already.
   */
  private keep(
    tenantId: string,
    courierKey: CourierKey,
    payout: ListedPayout,
    parcels: PaidParcel[],
  ): Promise<number | null> {
    const now = this.clock();
    return this.store.run(tenantId, async (tx) => {
      const row = await this.store.insertPayout(tx, tenantId, {
        courierKey,
        payoutId: payout.payoutId,
        amount: payout.amount,
        charges: payout.charges,
        total: payout.total,
        method: payout.method,
        paidAt: payout.paidAt ?? now,
        madeAt: payout.madeAt,
      });
      if (row === null) return null;
      let ours = 0;
      for (const paid of parcels) {
        const found = await this.parcelOf(tenantId, courierKey, paid, tx);
        if (found === null) continue;
        ours += 1;
        const held = await this.store.lockParcel(tx, tenantId, found);
        if (!held || held.paidAt !== null) continue;
        const learned =
          held.consignmentId === null &&
          paid.consignmentId !== null &&
          paid.consignmentId.length <= CONSIGNMENT_ID_MAX_LENGTH;
        await this.store.updateParcel(
          tx,
          tenantId,
          held.id,
          {
            paidAt: row.paidAt,
            payoutId: row.payoutId,
            ...(learned ? { consignmentId: paid.consignmentId } : {}),
          },
          now,
        );
      }
      await this.store.countPayout(tx, tenantId, row.id, { parcels: parcels.length, ours });
      return ours;
    });
  }

  /** The parcel's id: by the courier's number; by ours only for a parcel whose number Lytro never learned, or that agrees. */
  private async parcelOf(
    tenantId: string,
    courierKey: CourierKey,
    paid: PaidParcel,
    tx: Transaction,
  ): Promise<string | null> {
    if (paid.consignmentId !== null) {
      const byNumber = await this.store.parcelForNews(tx, tenantId, courierKey, {
        consignmentId: paid.consignmentId,
        invoice: null,
      });
      if (byNumber !== null) return byNumber.id;
    }
    if (paid.invoice === null) return null;
    const byInvoice = await this.store.parcelForNews(tx, tenantId, courierKey, {
      consignmentId: null,
      invoice: paid.invoice,
    });
    const agrees =
      byInvoice !== null &&
      (byInvoice.consignmentId === null || byInvoice.consignmentId === paid.consignmentId);
    return agrees ? byInvoice.id : null;
  }

  /** SEC-11: each call is logged without its credentials and paced to the courier's limit. No answer, or the circuit, is null. */
  private async call<T extends { outcome: string }>(
    tenantId: string,
    opened: OpenedConnection,
    work: () => Promise<T>,
  ): Promise<T | null> {
    const { adapter, account } = opened;
    try {
      return await this.calls.run(
        adapter,
        {
          tenantId,
          connectionId: account.connectionId,
          orderId: null,
          action: CourierCallAction.Payouts,
        },
        work,
      );
    } catch (error) {
      if (error instanceof CircuitOpen || error instanceof CourierNoAnswer) return null;
      throw error;
    } finally {
      await this.pause(MINUTE_MS / adapter.limits.callsPerMinute);
    }
  }

  private async renewed(tenantId: string, courierKey: CourierKey): Promise<boolean> {
    try {
      await this.connections.renewIfDue(tenantId, courierKey);
      return true;
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      return false;
    }
  }

  private async setting(key: PlatformSettingKey, fallback: number): Promise<number> {
    const setting = await this.settings.current(key);
    return typeof setting?.value === 'number' ? setting.value : fallback;
  }
}
