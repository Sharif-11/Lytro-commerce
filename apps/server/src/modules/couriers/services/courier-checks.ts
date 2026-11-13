import { Inject, Injectable, Logger } from '@nestjs/common';
import type { SelectCourierParcel } from '@lytronix/db';
import {
  COURIER_CALLS_PER_MINUTE,
  CourierCallAction,
  CourierConnectionState,
  CourierNewsSource,
  DEFAULT_COURIER_CHECK_MIN_AGE_HOURS,
  DEFAULT_COURIER_CHECK_QUIET_HOURS,
  DEFAULT_COURIER_CHECK_STOP_DAYS,
  DEFAULT_COURIER_SYNC_MINUTES,
  FINISHED_PARCEL_READINGS,
  LAPSED_TENANT_STATES,
  ParcelState,
  PlatformSettingKey,
  TenantState,
  type CourierKey,
} from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { CircuitOpen } from '../../../common/circuit-breaker';
import type { LimitStore } from '../../shared/limits/ports/limit-store';
import { LIMIT_STORE } from '../../shared/limits/tokens';
import { DAY_MS, HOUR_MS, MINUTE_MS } from '../../../common/time';
import { OrderFulfilment } from '../../orders/services/order-fulfilment';
import { OrderService } from '../../orders/services/order.service';
import type { OrderView } from '../../orders/types/orders';
import { PlatformSettingsService } from '../../platform-settings/services/platform-settings.service';
import { TenantSummaries } from '../../tenancy/services/tenant-summaries.service';
import { CourierNoAnswer, type CourierRefusal, type TrackAnswer } from '../ports/courier-adapter';
import type { CourierNotifier } from '../ports/courier-notifier';
import type { CourierStore } from '../ports/courier-store';
import { COURIER_CLOCK, COURIER_NOTIFIER, COURIER_PAUSE, COURIER_STORE } from '../tokens';
import { CourierCalls } from './courier-calls';
import { CourierConnections, type OpenedConnection } from './courier-connections';
import { CourierMessages } from './courier-messages';
import { CourierNewsPath } from './courier-news-path';

// How many parcels of one shop one night looks at. Oldest first, so what's left waits one more night and none is forgotten.
const PER_NIGHT = 2000;
// CRR-15: the owner hears at most once a day that a pasted address may be broken.
const PASTE_NOTICE_EVERY_MS = DAY_MS;
// A courier the circuit has stopped calling is tried again after this.
const RETRY_AFTER_SECONDS = 60;

/** What one night's check did. */
export interface NightResult {
  shops: number;
  checked: number;
  moved: number;
}

/**
 * CRR-14, CRR-15, D6-3, D6-4 (Phase 6 Slice 6.2, read agreed 2026-11-05): the only two things that ask a courier for status. Sync, on one
 * order, shows the saved answer if it asked within [10] minutes. The night check, at about [23:00] in Dhaka, asks once for each parcel on
 * its way that is at least [6] hours old with no message in [24] hours, spread out to its courier's limit, oldest first. A finished
 * parcel is never asked again, and after [30] days with no change one stops being asked and shows "no news" until Sync starts it again.
 * Nothing runs for a lapsed shop, a disconnected courier or a login the courier refuses: a refusal ends that connection's calls for the
 * run at once, since Steadfast locks a key out at 10 failures, and a test call decides whether the login is really bad before the owner
 * is told, because Steadfast's 401 can also mean a parcel on another profile. News found this way takes the one news path.
 */
@Injectable()
export class CourierChecks {
  private readonly logger = new Logger('CourierChecks');

  constructor(
    @Inject(LIMIT_STORE) private readonly limitStore: LimitStore,
    @Inject(COURIER_STORE) private readonly store: CourierStore,
    @Inject(CourierConnections) private readonly connections: CourierConnections,
    @Inject(CourierCalls) private readonly calls: CourierCalls,
    @Inject(CourierMessages) private readonly messages: CourierMessages,
    @Inject(CourierNewsPath) private readonly news: CourierNewsPath,
    @Inject(OrderFulfilment) private readonly fulfilment: OrderFulfilment,
    @Inject(OrderService) private readonly orders: OrderService,
    @Inject(PlatformSettingsService) private readonly settings: PlatformSettingsService,
    @Inject(TenantSummaries) private readonly shops: TenantSummaries,
    @Inject(COURIER_NOTIFIER) private readonly notifier: CourierNotifier,
    @Inject(COURIER_PAUSE) private readonly pause: (ms: number) => Promise<void>,
    @Inject(COURIER_CLOCK) private readonly clock: () => Date,
  ) {}

  /**
   * Slice 6.7 (read agreed 2026-11-06): staff checked what a courier reported on this order's parcel, so it leaves Needs a look.
   * Its news stays; marking an order with nothing to look at changes nothing.
   */
  async markSeen(tenantId: string, orderId: string): Promise<OrderView> {
    const now = this.clock();
    return this.store.run(tenantId, async (tx) => {
      const order = await this.fulfilment.lockWithin(tx, tenantId, orderId);
      await this.store.clearAttention(tx, tenantId, order.id, now);
      return this.orders.viewWithin(tx, tenantId, order, []);
    });
  }

  /** CRR-14: one order's parcel, by a person. Within the limit, or finished, it shows what's saved with no call. */
  async sync(tenantId: string, orderId: string): Promise<OrderView> {
    await this.takeCall(tenantId);
    const now = this.clock();
    const parcel = await this.store.run(tenantId, async (tx) => {
      const order = await this.fulfilment.lockWithin(tx, tenantId, orderId);
      return this.store.liveParcel(tx, tenantId, order.id);
    });
    if (parcel?.state !== ParcelState.Booked || parcel.settledAt === null) {
      throw new ApiError('conflict', 'ParcelNothingToSync', {});
    }
    const finished = parcel.reading !== null && FINISHED_PARCEL_READINGS.includes(parcel.reading);
    const limit = await this.setting(
      PlatformSettingKey.CourierSyncMinutes,
      DEFAULT_COURIER_SYNC_MINUTES,
    );
    const recent =
      parcel.lastCheckAt !== null &&
      now.getTime() - parcel.lastCheckAt.getTime() < limit * MINUTE_MS;
    if (finished || recent) return this.viewOf(tenantId, orderId);
    await this.connections.renewIfDue(tenantId, parcel.courierKey);
    const opened = await this.store.run(tenantId, (tx) =>
      this.connections.openedWithin(tx, tenantId, parcel.courierKey),
    );
    if (!opened) throw new ApiError('conflict', 'CourierNotConnected', {});
    const answer = await this.ask(tenantId, parcel, opened).catch((error: unknown) => {
      if (error instanceof CircuitOpen || error instanceof CourierNoAnswer) {
        throw new ApiError(
          'service_unavailable',
          'CourierNotAnswering',
          { courierKey: parcel.courierKey },
          RETRY_AFTER_SECONDS,
          { courier: opened.adapter.name },
        );
      }
      throw error;
    });
    if (answer.outcome === 'refused') {
      await this.judgeRefusal(tenantId, opened, parcel.courierKey, answer.refusal);
      throw new ApiError(
        'conflict',
        answer.refusal.message === null ? 'CourierRefusedNoReason' : 'CourierRefused',
        { courierKey: parcel.courierKey, courierMessage: answer.refusal.message },
        undefined,
        { courier: opened.adapter.name, message: answer.refusal.message ?? '' },
      );
    }
    // CRR-14: a person asking starts a parcel's checks again, and the 30 days with it.
    await this.saveAsked(tenantId, parcel.id, {
      checksStoppedAt: null,
      checksRestartedAt: this.clock(),
    });
    if (answer.outcome === 'found') {
      await this.takeNews(tenantId, parcel, answer, CourierNewsSource.Sync);
    }
    return this.viewOf(tenantId, orderId);
  }

  /** CRR-15: the night's run, for every shop not deleted. One shop's failure never stops the others. */
  async runNight(): Promise<NightResult> {
    const shops = await this.store.listShopIds();
    const result: NightResult = { shops: 0, checked: 0, moved: 0 };
    for (const shopId of shops) {
      try {
        const shop = await this.shops.findById(shopId);
        if (!shop || this.lapsed(shop.state)) continue;
        result.shops += 1;
        const done = await this.runShop(shopId);
        result.checked += done.checked;
        result.moved += done.moved;
      } catch (error) {
        this.logger.error(`the night check failed for tenant ${shopId}`, error as Error);
      }
    }
    return result;
  }

  private lapsed(state: TenantState): boolean {
    return state === TenantState.Deleted || LAPSED_TENANT_STATES.includes(state);
  }

  private async runShop(tenantId: string): Promise<{ checked: number; moved: number }> {
    const now = this.clock();
    const minAge = await this.setting(
      PlatformSettingKey.CourierCheckMinAgeHours,
      DEFAULT_COURIER_CHECK_MIN_AGE_HOURS,
    );
    const quiet = await this.setting(
      PlatformSettingKey.CourierCheckQuietHours,
      DEFAULT_COURIER_CHECK_QUIET_HOURS,
    );
    const stopDays = await this.setting(
      PlatformSettingKey.CourierCheckStopDays,
      DEFAULT_COURIER_CHECK_STOP_DAYS,
    );
    const due = await this.store.run(tenantId, (tx) =>
      this.store.dueForCheck(tx, tenantId, {
        createdBefore: new Date(now.getTime() - minAge * HOUR_MS),
        quietBefore: new Date(now.getTime() - quiet * HOUR_MS),
        limit: PER_NIGHT,
      }),
    );
    const stopBefore = now.getTime() - stopDays * DAY_MS;
    const opened = new Map<CourierKey, OpenedConnection | null>();
    const stopped = new Set<CourierKey>();
    let checked = 0;
    let moved = 0;
    for (const parcel of due) {
      // D6-4: no change, and no one asking by Sync, for this long, so it stops being asked after and shows "no news".
      const lastLife = Math.max(
        (parcel.lastChangeAt ?? parcel.createdAt).getTime(),
        parcel.checksRestartedAt?.getTime() ?? 0,
      );
      if (lastLife <= stopBefore) {
        await this.store.run(tenantId, (tx) =>
          this.store.updateParcel(tx, tenantId, parcel.id, { checksStoppedAt: now }, now),
        );
        continue;
      }
      if (stopped.has(parcel.courierKey)) continue;
      if (!opened.has(parcel.courierKey)) {
        opened.set(
          parcel.courierKey,
          // A login that can't be renewed tonight, or has ended, means no calls for this courier tonight.
          (await this.renewed(tenantId, parcel.courierKey))
            ? await this.store.run(tenantId, (tx) =>
                this.connections.openedWithin(tx, tenantId, parcel.courierKey),
              )
            : null,
        );
      }
      const connection = opened.get(parcel.courierKey);
      if (!connection) continue;
      let answer: TrackAnswer;
      try {
        answer = await this.ask(tenantId, parcel, connection);
      } catch (error) {
        // No answer tonight: this courier may be down, and the circuit stops the rest if so. It is asked again tomorrow.
        if (error instanceof CircuitOpen) stopped.add(parcel.courierKey);
        else if (!(error instanceof CourierNoAnswer)) throw error;
        continue;
      }
      checked += 1;
      if (answer.outcome === 'refused') {
        if (await this.judgeRefusal(tenantId, connection, parcel.courierKey, answer.refusal)) {
          stopped.add(parcel.courierKey);
        }
      } else if (answer.outcome === 'found') {
        await this.saveAsked(tenantId, parcel.id, {});
        if (await this.takeNews(tenantId, parcel, answer, CourierNewsSource.Check)) {
          moved += 1;
          await this.warnOfPaste(tenantId, parcel.courierKey);
        }
      } else {
        await this.saveAsked(tenantId, parcel.id, {});
      }
      await this.pause(MINUTE_MS / connection.adapter.limits.callsPerMinute);
    }
    return { checked, moved };
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

  private ask(
    tenantId: string,
    parcel: SelectCourierParcel,
    opened: OpenedConnection,
  ): Promise<TrackAnswer> {
    const { adapter, account } = opened;
    return this.calls.run(
      adapter,
      {
        tenantId,
        connectionId: account.connectionId,
        orderId: parcel.orderId,
        action: CourierCallAction.Track,
      },
      () =>
        adapter.track(account, {
          consignmentId: parcel.consignmentId,
          invoice: parcel.invoice,
        }),
    );
  }

  /** The one news path, for what asking found. True when it told something the parcel didn't already hold. */
  private async takeNews(
    tenantId: string,
    parcel: SelectCourierParcel,
    answer: Extract<TrackAnswer, { outcome: 'found' }>,
    source: CourierNewsSource,
  ): Promise<boolean> {
    if (answer.news.rawStatus === parcel.courierStatus) return false;
    const stored = await this.store.run(tenantId, (tx) =>
      this.messages.storeNews(tx, tenantId, parcel.courierKey, answer.news, source),
    );
    if (stored === null) return false;
    await this.news.apply(tenantId, stored);
    return true;
  }

  private saveAsked(
    tenantId: string,
    parcelId: string,
    extra: { checksStoppedAt?: null; checksRestartedAt?: Date },
  ): Promise<SelectCourierParcel> {
    const now = this.clock();
    return this.store.run(tenantId, (tx) =>
      this.store.updateParcel(tx, tenantId, parcelId, { lastCheckAt: now, ...extra }, now),
    );
  }

  /**
   * §3.6: a refused login stops this connection's calls for the run, and a test call decides whether it is really bad, since
   * Steadfast's 401 can also mean a parcel on another profile. True when the connection should stop.
   */
  private async judgeRefusal(
    tenantId: string,
    opened: OpenedConnection,
    courierKey: CourierKey,
    refusal: CourierRefusal,
  ): Promise<boolean> {
    if (!refusal.login) return false;
    const { adapter, account } = opened;
    const test = await this.calls
      .run(
        adapter,
        {
          tenantId,
          connectionId: account.connectionId,
          orderId: null,
          action: CourierCallAction.Test,
        },
        () => adapter.testConnection(account),
      )
      .catch(() => null);
    if (test?.outcome !== 'refused') return true;
    const now = this.clock();
    await this.store.run(tenantId, (tx) =>
      this.store.updateConnection(
        tx,
        tenantId,
        account.connectionId,
        { state: CourierConnectionState.LoginRefused },
        now,
      ),
    );
    await this.tellOwner(tenantId, courierKey, 'login_refused');
    return true;
  }

  /** CRR-15: news no message brought, on a connection whose messages have been arriving: only the owner hears, once a day. */
  private async warnOfPaste(tenantId: string, courierKey: CourierKey): Promise<void> {
    const now = this.clock();
    const connection = await this.store.run(tenantId, (tx) =>
      this.store.findConnection(tx, tenantId, courierKey),
    );
    if (!connection?.lastMessageAt) return;
    const last = connection.pasteWarnedAt;
    if (last !== null && now.getTime() - last.getTime() < PASTE_NOTICE_EVERY_MS) return;
    await this.store.run(tenantId, (tx) =>
      this.store.updateConnection(tx, tenantId, connection.id, { pasteWarnedAt: now }, now),
    );
    await this.tellOwner(tenantId, courierKey, 'paste_broken');
  }

  private async tellOwner(
    tenantId: string,
    courierKey: CourierKey,
    trouble: 'login_refused' | 'paste_broken',
  ): Promise<void> {
    try {
      await this.notifier.connectionTrouble({ tenantId, courierKey, trouble });
    } catch (error) {
      this.logger.error(`could not tell the owner of ${trouble}`, error as Error);
    }
  }

  private async setting(key: PlatformSettingKey, fallback: number): Promise<number> {
    const setting = await this.settings.current(key);
    return typeof setting?.value === 'number' ? setting.value : fallback;
  }

  /** CRR-19: Sync shares a shop's limit with booking in spirit, by its own window. */
  private async takeCall(tenantId: string): Promise<void> {
    const verdict = await this.limitStore.take(
      `courier-sync:${tenantId}`,
      COURIER_CALLS_PER_MINUTE,
      MINUTE_MS,
      this.clock(),
    );
    if (!verdict.allowed) {
      throw new ApiError(
        'rate_limited',
        'CourierCallsPerMinute',
        {},
        Math.ceil(verdict.resetMs / 1000),
      );
    }
  }

  private viewOf(tenantId: string, orderId: string): Promise<OrderView> {
    return this.store.run(tenantId, async (tx) => {
      const order = await this.fulfilment.lockWithin(tx, tenantId, orderId);
      return this.orders.viewWithin(tx, tenantId, order, []);
    });
  }
}
