import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import type { SelectFraudCheck, SelectFraudRule } from '@lytronix/db';
import {
  CourierKey,
  DEFAULT_FRAUD_CHECKS_PER_SHOP_PER_MINUTE,
  FRAUD_CHECK_CACHE_DAYS,
  FraudCheckTrigger,
  FraudSkipReason,
  FraudSource,
  FraudSourceState,
  FulfilmentType,
  LedgerEntryType,
  PlatformSettingKey,
  RateKey,
  TenantState,
  type UpdateFraudRuleInput,
  type Language,
} from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { MESSAGE_KEYS, type MessageKey } from '../../../common/i18n/message-key';
import { translate } from '../../../common/i18n/messages';
import { SlidingWindow } from '../../../common/sliding-window';
import { DAY_MS, MINUTE_MS, SECOND_MS } from '../../../common/time';
import { BalanceService } from '../../balance/services/balance.service';
import { rateToPaisa, toPaisa } from '../../balance/services/money';
import { RateService } from '../../balance/services/rate.service';
import type { CourierFraudFigures } from '../../couriers/ports/courier-adapter';
import { CourierFraudScores } from '../../couriers/services/courier-fraud-scores';
import { PlatformSettingsService } from '../../platform-settings/services/platform-settings.service';
import { TenantSummaries } from '../../tenancy/services/tenant-summaries.service';
import type { FraudCheckStore } from '../ports/fraud-check-store';
import { FRAUD_CHECK_CLOCK, FRAUD_CHECK_STORE } from '../tokens';
import type { FraudCheckJob } from './fraud-check-queue';

/** Who asked for a check. */
export interface FraudCheckActor {
  tenantId: string;
  /** The staff member; null for the owner's own session (AUD-02). */
  userId: string | null;
}

/** FRD-01 as amended (D7-48): a check's figures, by source; no level. */
export interface FraudCheckView {
  id: string;
  phone: string;
  checkedAt: string;
  trigger: FraudCheckTrigger;
  orderId: string | null;
  /** FRD-02, FRD-11: each source and what it did; a reused courier answer is "cached" (FRD-03). */
  sources: { source: FraudSource; state: FraudSourceState; cached: boolean }[];
  /** Steadfast's figures, when it answered. */
  steadfast: CourierFraudFigures | null;
  /** D7-49: the shop's own finished orders with the phone. */
  ownOrders: { delivered: number; returned: number; cancelled: number };
  /** FRD-03: what the balance paid. */
  cost: string;
}

/** A stored message key, read back: one the server still words, or nothing. */
function isMessageKey(key: string): key is MessageKey {
  return (MESSAGE_KEYS as readonly string[]).includes(key);
}

/** FRD-05 (Slice 7.7): how long a new order's automatic check may take before the page calls it failed. */
export const ORDER_CHECK_WAIT_MS = 15 * 60 * 1000;

/** FRD-05 (Slice 7.7): a new order's automatic check as the order's page shows it. */
export interface OrderFraudCheckView {
  state: 'done' | 'pending' | 'skipped' | 'not_applicable';
  reason: FraudSkipReason | 'failed' | null;
  minAmount: string | null;
  message: string | null;
  check: FraudCheckView | null;
}

/** FRD-05, D7-50: the automatic check. */
export interface FraudRuleView {
  codOrders: boolean;
  minAmount: string | null;
}

interface CheckRequest {
  tenantId: string;
  userId: string | null;
  phone: string;
  trigger: FraudCheckTrigger;
  orderId: string | null;
}

/** FRD-01: a row as the answer shows it. */
export function fraudCheckViewOf(row: SelectFraudCheck): FraudCheckView {
  const answered = row.steadfastState === FraudSourceState.Answered;
  return {
    id: row.id,
    phone: row.phone,
    checkedAt: row.createdAt.toISOString(),
    trigger: row.trigger,
    orderId: row.orderId,
    sources: [
      {
        source: FraudSource.Steadfast,
        state: row.steadfastState,
        cached: row.steadfastFrom !== null,
      },
      { source: FraudSource.OwnOrders, state: FraudSourceState.Answered, cached: false },
    ],
    steadfast: answered
      ? {
          deliveredPercent: row.steadfastDeliveredPercent,
          cancelledPercent: row.steadfastCancelledPercent,
          returnedPercent: row.steadfastReturnedPercent,
          volumeBand: row.steadfastVolumeBand,
          volumeRange: row.steadfastVolumeRange,
          reports: row.steadfastReports ?? 0,
          doubtful: row.steadfastDoubtful ?? false,
          categories: row.steadfastCategories ?? [],
        }
      : null,
    ownOrders: {
      delivered: row.ownDelivered,
      returned: row.ownReturned,
      cancelled: row.ownCancelled,
    },
    cost: row.cost,
  };
}

function ruleViewOf(row: SelectFraudRule | null): FraudRuleView {
  // D7-50: with no row, every new cash-on-delivery order is checked, whatever its amount.
  return row
    ? { codOrders: row.codOrders, minAmount: row.minAmount }
    : { codOrders: true, minAmount: null };
}

/**
 * FRD-01 to FRD-08, FRD-11 (Phase 7 Slice 7.5, read agreed 2026-11-07): checking a phone before sending a parcel.
 *
 * - Sources (D7-45): Steadfast's record of the phone through the shop's own key, and the shop's own finished orders.
 *   Figures only, no level (D7-48). A shop without Steadfast gets its own orders, Steadfast "not connected" (D7-46).
 * - Steadfast's answer is reused for three days, so a second check in them asks no one (FRD-04); the shop's own counts
 *   are counted afresh every time, since they cost nothing.
 * - A Steadfast that fails is noted and the check goes on (FRD-11). Only an answer from Steadfast, fresh or reused, is
 *   charged, at the fraud-check rate (FRD-03), which is zero at launch (D7-7).
 * - Refused (FRD-08, D7-47): a frozen balance (a lapsed shop) with tenant_offline; a trial only while checks are charged,
 *   with plan_feature_unavailable; less than the rate on the balance with quota_exceeded.
 * - FRD-07: one shop's checks a minute, staff's and the automatic ones together, in memory, exact while there is one
 *   server (D3-2).
 * - FRD-05, FRD-06: the automatic check of a new cash-on-delivery order runs apart from the order; whatever happens to it,
 *   the order is never held up, and a check that can't run is skipped.
 */
@Injectable()
export class FraudChecks implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FraudChecks.name);
  private readonly windows = new SlidingWindow(MINUTE_MS);
  private sweeper: NodeJS.Timeout | null = null;

  constructor(
    @Inject(FRAUD_CHECK_STORE) private readonly store: FraudCheckStore,
    @Inject(CourierFraudScores) private readonly scores: CourierFraudScores,
    @Inject(BalanceService) private readonly balance: BalanceService,
    @Inject(RateService) private readonly rates: RateService,
    @Inject(PlatformSettingsService) private readonly settings: PlatformSettingsService,
    @Inject(TenantSummaries) private readonly shops: TenantSummaries,
    @Inject(FRAUD_CHECK_CLOCK) private readonly clock: () => Date,
  ) {}

  onModuleInit(): void {
    this.sweeper = setInterval(() => {
      this.windows.sweep(Date.now());
    }, MINUTE_MS);
    this.sweeper.unref();
  }

  onModuleDestroy(): void {
    if (this.sweeper) clearInterval(this.sweeper);
  }

  /** FRD-01: a check staff asked for. */
  async run(actor: FraudCheckActor, phone: string): Promise<FraudCheckView> {
    const rate = await this.rate();
    await this.refuseIfBarred(actor.tenantId, rate);
    await this.admit(actor.tenantId);
    return this.check({ ...actor, phone, trigger: FraudCheckTrigger.Staff, orderId: null }, rate);
  }

  /**
   * FRD-05, FRD-06, D7-50: the automatic check of a new cash-on-delivery order, by its rule. A check the rule leaves
   * out, or that can't run -- refused, or the minute's checks used up -- is skipped and logged, never retried.
   */
  async onNewOrder(job: FraudCheckJob): Promise<FraudCheckView | null> {
    const rule = await this.rule(job.tenantId);
    if (!rule.codOrders) {
      await this.skipped(job, FraudSkipReason.RuleOff, null, null);
      return null;
    }
    if (rule.minAmount !== null && toPaisa(job.codAmount) < toPaisa(rule.minAmount)) {
      await this.skipped(job, FraudSkipReason.BelowMinimum, rule.minAmount, null);
      return null;
    }
    try {
      const rate = await this.rate();
      await this.refuseIfBarred(job.tenantId, rate);
      await this.admit(job.tenantId);
      return await this.check(
        {
          tenantId: job.tenantId,
          userId: null,
          phone: job.phone,
          trigger: FraudCheckTrigger.Order,
          orderId: job.orderId,
        },
        rate,
      );
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      this.logger.log(`skipped the automatic check of order ${job.orderId}: ${error.code}`);
      await this.skipped(
        job,
        error.messageKey === 'TooManyFraudChecks'
          ? FraudSkipReason.MinuteLimit
          : FraudSkipReason.Refused,
        null,
        error.messageKey,
      );
      return null;
    }
  }

  /**
   * FRD-05, FRD-06 (Slice 7.7): a new order's automatic check as its page shows it -- done with the check, still being
   * checked, skipped and why, or not one the rule covers (takeaway, dine-in, no phone, nothing collected). A refusal comes
   * in the server's own words. A job that never wrote either, past the time one takes, failed.
   */
  async orderCheck(
    tenantId: string,
    orderId: string,
    language: Language,
  ): Promise<OrderFraudCheckView> {
    const { order, check, skip } = await this.store.run(tenantId, (tx) =>
      this.store.orderCheck(tx, tenantId, orderId),
    );
    if (!order) throw new ApiError('not_found', 'OrderNotFound', {});
    const none = { reason: null, minAmount: null, message: null, check: null };
    if (check) return { ...none, state: 'done', check: fraudCheckViewOf(check) };
    if (skip) {
      return {
        ...none,
        state: 'skipped',
        reason: skip.reason,
        minAmount: skip.minAmount,
        message:
          skip.messageKey !== null && isMessageKey(skip.messageKey)
            ? translate(skip.messageKey, language)
            : null,
      };
    }
    const covered =
      order.fulfilmentType === FulfilmentType.Delivery &&
      order.customerPhone !== null &&
      toPaisa(order.codAmount) > 0n;
    if (!covered) return { ...none, state: 'not_applicable' };
    const waited = this.clock().getTime() - order.createdAt.getTime();
    return waited < ORDER_CHECK_WAIT_MS
      ? { ...none, state: 'pending' }
      : { ...none, state: 'skipped', reason: 'failed' };
  }

  private async skipped(
    job: FraudCheckJob,
    reason: FraudSkipReason,
    minAmount: string | null,
    messageKey: string | null,
  ): Promise<void> {
    await this.store.run(job.tenantId, (tx) =>
      this.store.recordSkip(tx, {
        tenantId: job.tenantId,
        orderId: job.orderId,
        reason,
        minAmount,
        messageKey,
      }),
    );
  }

  /** FRD-01: the latest check of a phone, asking no one. */
  async latest(tenantId: string, phone: string): Promise<FraudCheckView | null> {
    const row = await this.store.run(tenantId, (tx) => this.store.latest(tx, tenantId, phone));
    return row ? fraudCheckViewOf(row) : null;
  }

  /** LIF-19: the day-60 deletion's fraud step: the checks and the rule. */
  deleteAllForTenant(tenantId: string): Promise<void> {
    return this.store.run(tenantId, (tx) => this.store.deleteAllForTenant(tx, tenantId));
  }

  async rule(tenantId: string): Promise<FraudRuleView> {
    return ruleViewOf(await this.store.run(tenantId, (tx) => this.store.rule(tx, tenantId)));
  }

  async saveRule(tenantId: string, input: UpdateFraudRuleInput): Promise<FraudRuleView> {
    const minAmount = input.minAmount === null ? null : input.minAmount.toFixed(2);
    return ruleViewOf(
      await this.store.run(tenantId, (tx) =>
        this.store.saveRule(tx, tenantId, { codOrders: input.codOrders, minAmount }),
      ),
    );
  }

  private async check(request: CheckRequest, rate: string): Promise<FraudCheckView> {
    const { tenantId, phone } = request;
    const since = new Date(this.clock().getTime() - FRAUD_CHECK_CACHE_DAYS * DAY_MS);
    // D7-46: a shop that has disconnected Steadfast is told so, not shown what it answered before.
    const reused = (await this.scores.connected(tenantId, CourierKey.Steadfast))
      ? await this.store.run(tenantId, (tx) =>
          this.store.steadfastAnswerSince(tx, tenantId, phone, since),
        )
      : null;
    const steadfast = reused
      ? {
          state: FraudSourceState.Answered,
          figures: fraudCheckViewOf(reused).steadfast,
          from: reused.id,
        }
      : await this.ask(request);
    const row = await this.balance.runStandalone(tenantId, async (tx) => {
      const own = await this.store.ownOrders(tx, tenantId, phone);
      let cost = '0.00';
      if (steadfast.state === FraudSourceState.Answered && rateToPaisa(rate) > 0n) {
        const entry = await this.balance.charge(tx, {
          tenantId,
          type: LedgerEntryType.FraudCheck,
          units: '1',
          rateUsed: rate,
          reference: { kind: 'fraud_check' },
        });
        cost = entry.amount.replace('-', '');
      }
      const figures = steadfast.figures;
      return this.store.insert(tx, {
        tenantId,
        phone,
        trigger: request.trigger,
        orderId: request.orderId,
        userId: request.userId,
        steadfastState: steadfast.state,
        steadfastFrom: steadfast.from,
        steadfastDeliveredPercent: figures?.deliveredPercent ?? null,
        steadfastCancelledPercent: figures?.cancelledPercent ?? null,
        steadfastReturnedPercent: figures?.returnedPercent ?? null,
        steadfastVolumeBand: figures?.volumeBand ?? null,
        steadfastVolumeRange: figures?.volumeRange ?? null,
        steadfastReports: figures ? figures.reports : null,
        steadfastDoubtful: figures ? figures.doubtful : null,
        steadfastCategories: figures ? figures.categories : null,
        ownDelivered: own.delivered,
        ownReturned: own.returned,
        ownCancelled: own.cancelled,
        cost,
      });
    });
    return fraudCheckViewOf(row);
  }

  /** D7-45, FRD-11: Steadfast, through the shop's own connection; no answer is a failure the check goes on without. */
  private async ask(request: CheckRequest): Promise<{
    state: FraudSourceState;
    figures: CourierFraudFigures | null;
    from: null;
  }> {
    const score = await this.scores.scoreOf(
      request.tenantId,
      CourierKey.Steadfast,
      request.phone,
      request.orderId,
    );
    return score.state === FraudSourceState.Answered
      ? { state: score.state, figures: score.figures, from: null }
      : { state: score.state, figures: null, from: null };
  }

  /** FRD-07: one shop's checks a minute; a refused check isn't counted. */
  private async admit(tenantId: string): Promise<void> {
    const setting = await this.settings.current(PlatformSettingKey.FraudChecksPerShopPerMinute);
    const limit =
      typeof setting?.value === 'number' ? setting.value : DEFAULT_FRAUD_CHECKS_PER_SHOP_PER_MINUTE;
    const verdict = this.windows.take(`fraud-check:${tenantId}`, limit, this.clock().getTime());
    if (!verdict.allowed) {
      throw new ApiError(
        'rate_limited',
        'TooManyFraudChecks',
        {},
        Math.max(1, Math.ceil(verdict.resetMs / SECOND_MS)),
      );
    }
  }

  private async rate(): Promise<string> {
    const rate = await this.rates.current(RateKey.FraudCheck);
    if (!rate) throw new Error('the fraud_check rate is not seeded');
    return rate.value;
  }

  /**
   * FRD-08 as amended (D7-47): a frozen balance -- a lapsed shop -- is refused whatever the rate. While checks are free,
   * nothing else is; once they are charged, a trial is refused, and so is a balance short of the rate, unless the shop has
   * no Steadfast to pay for (its own orders are free, FRD-03). Nothing is held: the charge checks the balance again once
   * the answer is back.
   */
  private async refuseIfBarred(tenantId: string, rate: string): Promise<void> {
    const held = await this.balance.runStandalone(tenantId, (tx) =>
      this.balance.heldWithin(tx, tenantId),
    );
    if (held.frozen) throw new ApiError('tenant_offline', 'BalanceFrozen', {});
    if (rateToPaisa(rate) === 0n) return;
    const shop = await this.shops.findById(tenantId);
    if (shop?.state === TenantState.Trial) {
      throw new ApiError('plan_feature_unavailable', 'FraudCheckNeedsPlan', {});
    }
    if (
      toPaisa(held.amount) < rateToPaisa(rate) &&
      (await this.scores.connected(tenantId, CourierKey.Steadfast))
    ) {
      throw new ApiError('quota_exceeded', 'InsufficientBalance', { balance: held.amount });
    }
  }
}
