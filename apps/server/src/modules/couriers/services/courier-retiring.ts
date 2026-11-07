import { Inject, Injectable, Logger } from '@nestjs/common';
import type { BlockingParcelRow, SelectCourierAdapter, Transaction } from '@lytronix/db';
import {
  ActorType,
  AuditAction,
  AuditResult,
  COURIER_BLOCKING_SHOWN,
  CourierAdapterState,
  CourierBlockReason,
  DEFAULT_COURIER_CHECK_STOP_DAYS,
  FulfillmentStatus,
  ParcelState,
  PlatformActorType,
  PlatformAuditAction,
  PlatformSettingKey,
  type CourierKey,
  type CourierReasonInput,
  type RetireCourierInput,
} from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { DAY_MS } from '../../../common/time';
import { PlatformAuditService } from '../../audit/services/platform-audit.service';
import type { PlanOperator } from '../../billing/services/plans.service';
import { CatalogueActivity, type ResolvedActor } from '../../catalogue/services/catalogue-activity';
import { PlatformSettingsService } from '../../platform-settings/services/platform-settings.service';
import { TenantSummaries } from '../../tenancy/services/tenant-summaries.service';
import type { CourierAdapter } from '../ports/courier-adapter';
import type { CourierAdapterStore } from '../ports/courier-adapter-store';
import type { CourierNotifier } from '../ports/courier-notifier';
import type { CourierStore } from '../ports/courier-store';
import { COURIER_ADAPTER_STORE, COURIER_CLOCK, COURIER_NOTIFIER, COURIER_STORE } from '../tokens';
import { CourierMessages } from './courier-messages';
import { CourierRegistry } from './courier-registry';

// An order whose parcel is still on its way: not yet delivered, part delivered, returned or cancelled.
const MOVING: ReadonlySet<string> = new Set([
  FulfillmentStatus.Processing,
  FulfillmentStatus.Shipped,
]);
// The platform retiring a courier acts in each shop as the server, not as a person there.
const LYTRO: ResolvedActor = { id: null, ip: null, type: ActorType.System };

/** CRR-23 (Slice 6.6): a courier as the operator sees it, and how many shops lean on it. */
export interface OperatorCourierView {
  key: CourierKey;
  name: string;
  state: CourierAdapterState;
  suggestedKey: CourierKey | null;
  retiringSince: Date | null;
  removedAt: Date | null;
  /** Shops connected to it, shops whose default it is, and their parcels with it still on their way. */
  shops: number;
  defaultFor: number;
  onTheirWay: number;
}

/** CRR-24 (Slice 6.6): one order that holds a courier back from being removed, and why. */
export interface CourierBlockingOrder {
  tenantId: string;
  shopName: string;
  slug: string;
  orderId: string;
  orderNumber: string | null;
  reason: CourierBlockReason;
  /** Slice 6.7: its courier's own last status, for a parcel on its way. */
  courierStatus: string | null;
  /** Slice 6.7: for a parcel waiting for its payout, when its courier reported it finished, and when it stops waiting. */
  finishedAt: Date | null;
  waitsUntil: Date | null;
}

export interface CourierBlockingView {
  courierKey: CourierKey;
  total: number;
  orders: CourierBlockingOrder[];
}

interface ShopTally {
  shops: number;
  defaultFor: number;
  onTheirWay: number;
}

/**
 * CRR-23 to CRR-25 (Phase 6 Slice 6.6, read agreed 2026-11-06): the operator retiring a courier, bringing it back, and removing it for good.
 * Retiring keeps every shop already connected booking, tracking and hearing from it, and lets no new shop connect. Each connected shop is
 * told in Lytro's own words, with the one other active courier the operator suggests, and a shop whose default it was moves to that
 * courier if connected to it, else to its longest-connected other courier; one with no other keeps it. Undoing tells the same shops it is
 * back, and defaults that moved stay. Removal waits until no order holds it back: a booking not yet settled, a parcel still on its way, or
 * one the courier reported a result for and hasn't paid, for the days the night run waits for a payout. Then every shop's keys and
 * message address for it go, its past parcels stay, and its code goes in a later change. The operator's reason is for the platform
 * audit log only.
 */
@Injectable()
export class CourierRetiring {
  private readonly logger = new Logger('CourierRetiring');

  constructor(
    @Inject(COURIER_STORE) private readonly store: CourierStore,
    @Inject(COURIER_ADAPTER_STORE) private readonly adapters: CourierAdapterStore,
    @Inject(CourierRegistry) private readonly registry: CourierRegistry,
    @Inject(CourierMessages) private readonly messages: CourierMessages,
    @Inject(CatalogueActivity) private readonly activity: CatalogueActivity,
    @Inject(PlatformAuditService) private readonly audit: PlatformAuditService,
    @Inject(PlatformSettingsService) private readonly settings: PlatformSettingsService,
    @Inject(TenantSummaries) private readonly shops: TenantSummaries,
    @Inject(COURIER_NOTIFIER) private readonly notifier: CourierNotifier,
    @Inject(COURIER_CLOCK) private readonly clock: () => Date,
  ) {}

  /** CRR-23: every courier, its state and how many shops lean on it. */
  async couriers(): Promise<OperatorCourierView[]> {
    const states = await this.states();
    const tallies = new Map<CourierKey, ShopTally>();
    const all = this.registry.all();
    for (const shopId of await this.store.listShopIds()) {
      await this.store.run(shopId, async (tx) => {
        for (const adapter of all) {
          const facts = await this.store.shopFacts(tx, shopId, adapter.key);
          const tally = tallies.get(adapter.key) ?? { shops: 0, defaultFor: 0, onTheirWay: 0 };
          tally.shops += facts.connected ? 1 : 0;
          tally.defaultFor += facts.isDefault ? 1 : 0;
          tally.onTheirWay += facts.onTheirWay;
          tallies.set(adapter.key, tally);
        }
      });
    }
    return all.map((adapter) =>
      this.viewOf(adapter, states.get(adapter.key), tallies.get(adapter.key)),
    );
  }

  /** CRR-23, CRR-25: retires a courier, moving the defaults that lean on it and telling every shop connected. */
  async retire(
    courierKey: CourierKey,
    input: RetireCourierInput,
    operator: PlanOperator,
  ): Promise<{ courier: OperatorCourierView; told: number; defaultsMoved: number }> {
    const adapter = this.adapterOf(courierKey);
    if (input.suggestedKey === courierKey || !this.registry.of(input.suggestedKey)) {
      throw new ApiError('conflict', 'CourierSuggestionInvalid', {
        suggestedKey: input.suggestedKey,
      });
    }
    const now = this.clock();
    const row = await this.adapters.run(async (tx) => {
      // Both held, in one order, so two operators retiring each other's suggestion can't deadlock.
      const [first, second] = [courierKey, input.suggestedKey].sort();
      const held = new Map([
        [first, await this.adapters.lock(tx, first as CourierKey)],
        [second, await this.adapters.lock(tx, second as CourierKey)],
      ]);
      const own = held.get(courierKey);
      if (own?.state === CourierAdapterState.Removed)
        throw new ApiError('not_found', 'CourierNotAvailable', {});
      if (own?.state === CourierAdapterState.Retiring)
        throw new ApiError('conflict', 'CourierAlreadyRetiring', {});
      if (held.get(input.suggestedKey)?.state !== CourierAdapterState.Active) {
        throw new ApiError('conflict', 'CourierSuggestionInvalid', {
          suggestedKey: input.suggestedKey,
        });
      }
      const saved = await this.adapters.save(
        tx,
        courierKey,
        {
          state: CourierAdapterState.Retiring,
          suggestedKey: input.suggestedKey,
          retiringSince: now,
          removedAt: null,
        },
        now,
      );
      await this.record(tx, operator, PlatformAuditAction.CourierRetired, {
        courierKey,
        suggestedKey: input.suggestedKey,
        reason: input.reason,
      });
      return saved;
    });
    const states = await this.states();
    let told = 0;
    let defaultsMoved = 0;
    for (const shopId of await this.store.listShopIds()) {
      try {
        const done = await this.store.run(shopId, async (tx) => {
          const rows = await this.store.listConnections(tx, shopId);
          const mine = rows.find((each) => each.courierKey === courierKey);
          if (!mine) return null;
          let movedTo: CourierKey | null = null;
          if (mine.isDefault) {
            // Longest connected first, as the shop's connections are listed; only a courier still active can take over.
            const others = rows.filter(
              (each) =>
                each.courierKey !== courierKey &&
                (states.get(each.courierKey)?.state ?? CourierAdapterState.Active) ===
                  CourierAdapterState.Active,
            );
            const next = others.find((each) => each.courierKey === input.suggestedKey) ?? others[0];
            if (next) {
              await this.store.setDefaultConnection(tx, shopId, next.courierKey, now);
              movedTo = next.courierKey;
            }
          }
          await this.activity.record(
            tx,
            shopId,
            LYTRO,
            AuditAction.CourierRetiring,
            { type: 'courier', id: mine.id },
            {
              courierKey,
              suggestedKey: input.suggestedKey,
              defaultMovedTo: movedTo,
            },
          );
          return { movedTo };
        });
        if (!done) continue;
        told += 1;
        if (done.movedTo) defaultsMoved += 1;
        await this.tell(() =>
          this.notifier.courierRetiring({
            tenantId: shopId,
            courierKey,
            suggestedKey: input.suggestedKey,
            defaultMovedTo: done.movedTo,
          }),
        );
      } catch (error) {
        this.logger.error(
          `telling tenant ${shopId} that ${courierKey} is retiring failed`,
          error as Error,
        );
      }
    }
    return {
      courier: this.viewOf(adapter, row, await this.tallyOf(courierKey)),
      told,
      defaultsMoved,
    };
  }

  /** Slice 6.6: brings a retiring courier back; the shops connected to it are told, and defaults that moved stay. */
  async undo(
    courierKey: CourierKey,
    input: CourierReasonInput,
    operator: PlanOperator,
  ): Promise<{ courier: OperatorCourierView; told: number }> {
    const adapter = this.adapterOf(courierKey);
    const now = this.clock();
    const row = await this.adapters.run(async (tx) => {
      const held = await this.adapters.lock(tx, courierKey);
      if (held.state !== CourierAdapterState.Retiring)
        throw new ApiError('conflict', 'CourierNotRetiring', {});
      const saved = await this.adapters.save(
        tx,
        courierKey,
        {
          state: CourierAdapterState.Active,
          suggestedKey: null,
          retiringSince: null,
          removedAt: null,
        },
        now,
      );
      await this.record(tx, operator, PlatformAuditAction.CourierRetireUndone, {
        courierKey,
        reason: input.reason,
      });
      return saved;
    });
    let told = 0;
    for (const shopId of await this.store.listShopIds()) {
      try {
        const connected = await this.store.run(shopId, async (tx) => {
          const mine = (await this.store.listConnections(tx, shopId)).find(
            (each) => each.courierKey === courierKey,
          );
          if (!mine) return false;
          await this.activity.record(
            tx,
            shopId,
            LYTRO,
            AuditAction.CourierRetiringUndone,
            { type: 'courier', id: mine.id },
            { courierKey },
          );
          return true;
        });
        if (!connected) continue;
        told += 1;
        await this.tell(() => this.notifier.courierBack({ tenantId: shopId, courierKey }));
      } catch (error) {
        this.logger.error(
          `telling tenant ${shopId} that ${courierKey} is back failed`,
          error as Error,
        );
      }
    }
    return { courier: this.viewOf(adapter, row, await this.tallyOf(courierKey)), told };
  }

  /** CRR-24: the orders that hold a courier back from being removed, across every shop, the first [200] of them. */
  async blocking(courierKey: CourierKey): Promise<CourierBlockingView> {
    this.adapterOf(courierKey);
    const orders = await this.blockingOrders(courierKey);
    return { courierKey, total: orders.length, orders: orders.slice(0, COURIER_BLOCKING_SHOWN) };
  }

  /**
   * CRR-24: removes a retiring courier once nothing holds it back. Its row is held exclusively while the check runs, and a booking's claim
   * reads it shared, so a booking already being claimed finishes first and is counted, and none starts after. Then every shop's keys and
   * message address for it go. Asked again once removed, it finishes taking away whatever was left.
   */
  async remove(
    courierKey: CourierKey,
    input: CourierReasonInput,
    operator: PlanOperator,
  ): Promise<{ courier: OperatorCourierView; disconnected: number }> {
    const adapter = this.adapterOf(courierKey);
    const now = this.clock();
    const row = await this.adapters.run(async (tx) => {
      const held = await this.adapters.lock(tx, courierKey);
      if (held.state === CourierAdapterState.Removed) return held;
      if (held.state !== CourierAdapterState.Retiring)
        throw new ApiError('conflict', 'CourierNotRetiring', {});
      const blocking = await this.blockingOrders(courierKey);
      if (blocking.length > 0) {
        throw new ApiError(
          'conflict',
          'CourierRemovalBlocked',
          { blocking: blocking.length },
          undefined,
          {
            n: blocking.length,
          },
        );
      }
      const saved = await this.adapters.save(
        tx,
        courierKey,
        {
          state: CourierAdapterState.Removed,
          suggestedKey: held.suggestedKey,
          retiringSince: held.retiringSince,
          removedAt: now,
        },
        now,
      );
      await this.record(tx, operator, PlatformAuditAction.CourierRemoved, {
        courierKey,
        reason: input.reason,
      });
      return saved;
    });
    let disconnected = 0;
    for (const shopId of await this.store.listShopIds()) {
      try {
        const gone = await this.store.run(shopId, async (tx) => {
          const mine = await this.store.deleteConnection(tx, shopId, courierKey);
          if (!mine) return false;
          await this.messages.forgetRoute(tx, mine.id);
          if (mine.isDefault) {
            const [next] = await this.store.listConnections(tx, shopId);
            if (next) await this.store.setDefaultConnection(tx, shopId, next.courierKey, now);
          }
          await this.activity.record(
            tx,
            shopId,
            LYTRO,
            AuditAction.CourierDisconnected,
            { type: 'courier', id: mine.id },
            {
              courierKey,
              removed: true,
            },
          );
          return true;
        });
        if (gone) disconnected += 1;
      } catch (error) {
        this.logger.error(`taking ${courierKey} away from tenant ${shopId} failed`, error as Error);
      }
    }
    return { courier: this.viewOf(adapter, row, await this.tallyOf(courierKey)), disconnected };
  }

  private async blockingOrders(courierKey: CourierKey): Promise<CourierBlockingOrder[]> {
    const days = await this.waitDays();
    const now = this.clock().getTime();
    const paidSince = new Date(now - days * DAY_MS);
    const orders: CourierBlockingOrder[] = [];
    for (const shopId of await this.store.listShopIds()) {
      const rows = await this.store.run(shopId, (tx) =>
        this.store.blockingParcels(tx, shopId, courierKey, paidSince),
      );
      if (rows.length === 0) continue;
      const shop = await this.shops.findById(shopId);
      for (const row of rows) {
        const reason = this.reasonOf(row);
        orders.push({
          tenantId: shopId,
          shopName: shop?.shopName ?? '',
          slug: shop?.slug ?? '',
          orderId: row.orderId,
          orderNumber: row.orderNumber,
          reason,
          courierStatus: reason === CourierBlockReason.OnItsWay ? row.courierStatus : null,
          finishedAt: reason === CourierBlockReason.AwaitingPayout ? row.lastChangeAt : null,
          waitsUntil:
            reason === CourierBlockReason.AwaitingPayout && row.lastChangeAt !== null
              ? new Date(row.lastChangeAt.getTime() + days * DAY_MS)
              : null,
        });
      }
    }
    return orders;
  }

  private reasonOf(row: BlockingParcelRow): CourierBlockReason {
    if (row.state !== ParcelState.Booked || row.settledAt === null)
      return CourierBlockReason.NotSettled;
    return MOVING.has(row.fulfillmentStatus)
      ? CourierBlockReason.OnItsWay
      : CourierBlockReason.AwaitingPayout;
  }

  private async tallyOf(courierKey: CourierKey): Promise<ShopTally> {
    const tally: ShopTally = { shops: 0, defaultFor: 0, onTheirWay: 0 };
    for (const shopId of await this.store.listShopIds()) {
      const facts = await this.store.run(shopId, (tx) =>
        this.store.shopFacts(tx, shopId, courierKey),
      );
      tally.shops += facts.connected ? 1 : 0;
      tally.defaultFor += facts.isDefault ? 1 : 0;
      tally.onTheirWay += facts.onTheirWay;
    }
    return tally;
  }

  private async states(): Promise<Map<CourierKey, SelectCourierAdapter>> {
    return new Map((await this.adapters.all()).map((row) => [row.courierKey, row]));
  }

  private viewOf(
    adapter: CourierAdapter,
    row: SelectCourierAdapter | undefined,
    tally: ShopTally | undefined,
  ): OperatorCourierView {
    return {
      key: adapter.key,
      name: adapter.name,
      state: row?.state ?? CourierAdapterState.Active,
      suggestedKey: row?.suggestedKey ?? null,
      retiringSince: row?.retiringSince ?? null,
      removedAt: row?.removedAt ?? null,
      shops: tally?.shops ?? 0,
      defaultFor: tally?.defaultFor ?? 0,
      onTheirWay: tally?.onTheirWay ?? 0,
    };
  }

  private adapterOf(courierKey: CourierKey): CourierAdapter {
    const adapter = this.registry.of(courierKey);
    if (!adapter) throw new ApiError('not_found', 'CourierNotAvailable', {});
    return adapter;
  }

  private record(
    tx: Transaction,
    operator: PlanOperator,
    action: PlatformAuditAction,
    summary: Record<string, unknown>,
  ): Promise<void> {
    return this.audit.recordWithin(tx, {
      actorType: PlatformActorType.Operator,
      actorId: operator.operatorId,
      action,
      targetType: 'courier',
      // The target column holds ids; the courier is named in the summary.
      targetId: null,
      result: AuditResult.Success,
      ip: operator.ip,
      summary,
    });
  }

  /** After its transaction, so a notice never tells of what rolled back; failing to tell changes nothing. */
  private async tell(send: () => Promise<void>): Promise<void> {
    try {
      await send();
    } catch (error) {
      this.logger.error('could not tell a shop about a retiring courier', error as Error);
    }
  }

  private async waitDays(): Promise<number> {
    const setting = await this.settings.current(PlatformSettingKey.CourierCheckStopDays);
    return typeof setting?.value === 'number' ? setting.value : DEFAULT_COURIER_CHECK_STOP_DAYS;
  }
}
