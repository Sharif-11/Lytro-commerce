import { Inject, Injectable } from '@nestjs/common';
import type { Transaction } from '@lytronix/db';
import {
  limitOf,
  OrderLimitMode,
  PlatformSettingKey,
  UsageMetric,
  type PlanLimits,
} from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import type { MessageKey } from '../../../common/i18n/message-key';
import { startOfDayDhaka, usageCycleStart } from '../../../common/time';
import { PlatformSettingsService } from '../../platform-settings/services/platform-settings.service';
import type { TenantSummary } from '../../tenancy/types/tenant-summary';
import { UsageWarnings } from '../../usage-warnings/services/usage-warnings';
import type { OrderStore } from '../ports/order-store';
import { ORDER_STORE } from '../tokens';

/** The shop as its handling is judged: its state, its own limits, and what its usage cycle counts from. */
export type HandlingShop = Pick<
  TenantSummary,
  'id' | 'state' | 'planLimits' | 'periodStart' | 'createdAt'
>;

/** QTA-03: the period's limit an order was handled past, when the mode let it through with a prompt. */
export interface HandlingPassed {
  metric: UsageMetric.OrdersMonthly;
  limit: number;
}

/** The shop's orders handled: in its whole life, this usage cycle, and today in Asia/Dhaka. */
export interface HandledCounts {
  total: number;
  period: number;
  today: number;
}

// QTA-03: what the period's limit does when the operator has set no mode.
const DEFAULT_MODE = OrderLimitMode.AllowWithPrompt;

function refusal(metric: UsageMetric, key: MessageKey, limit: number): ApiError {
  return new ApiError('plan_limit_reached', key, { metric, limit }, undefined, { limit });
}

/**
 * QTA-01 to QTA-07, TRL-03, PLN-19 (Phase 4 Slice 4.3): an order counts toward its shop's handling limits once, ever,
 * when it is first handled -- shipped or handed over by hand -- never when it is made. A trial's whole-life total and a
 * day's limit always refuse; the period's limit refuses or, by the operator's mode, lets the order through with a
 * prompt. Each count is read under the shop's handling lock, so two orders handled at once cannot both take the last
 * place. Warnings go out with the write (LIM-01, QTA-02); an unlimited limit never refuses or warns.
 */
@Injectable()
export class HandlingQuota {
  constructor(
    @Inject(ORDER_STORE) private readonly store: OrderStore,
    @Inject(UsageWarnings) private readonly warnings: UsageWarnings,
    @Inject(PlatformSettingsService) private readonly settings: PlatformSettingsService,
  ) {}

  /** Admits one more handled order in the caller's transaction, or refuses it with `plan_limit_reached`. */
  async admitWithin(
    tx: Transaction,
    shop: HandlingShop,
    now: Date,
  ): Promise<HandlingPassed | null> {
    await this.store.lockHandling(tx, shop.id);
    const limits: PlanLimits | null = shop.planLimits;
    const total = limitOf(limits, 'orders_total');
    if (total !== null) {
      const handled = await this.store.countHandled(tx, shop.id, null);
      if (handled >= total) {
        throw refusal(UsageMetric.OrdersTotal, 'OrdersTotalHandlingReached', total);
      }
      await this.warnings.check(tx, {
        tenantId: shop.id,
        metric: UsageMetric.OrdersTotal,
        used: handled + 1,
        limit: total,
      });
    }
    const daily = limitOf(limits, 'orders_handled_daily');
    if (daily !== null) {
      const today = await this.store.countHandled(tx, shop.id, startOfDayDhaka(now));
      if (today >= daily) {
        throw refusal(UsageMetric.OrdersDaily, 'OrdersDailyHandlingReached', daily);
      }
    }
    const monthly = limitOf(limits, 'orders_handled_monthly');
    if (monthly === null) return null;
    const period = await this.store.countHandled(tx, shop.id, usageCycleStart(shop, now));
    if (period >= monthly && (await this.mode()) === OrderLimitMode.Block) {
      throw refusal(UsageMetric.OrdersMonthly, 'OrdersHandlingReached', monthly);
    }
    await this.warnings.check(tx, {
      tenantId: shop.id,
      metric: UsageMetric.OrdersMonthly,
      used: period + 1,
      limit: monthly,
    });
    return period >= monthly ? { metric: UsageMetric.OrdersMonthly, limit: monthly } : null;
  }

  /** LIM-02: the shop's handled orders, as the usage page shows them. */
  counts(shop: HandlingShop, now: Date): Promise<HandledCounts> {
    return this.store.run(shop.id, async (tx) => ({
      total: await this.store.countHandled(tx, shop.id, null),
      period: await this.store.countHandled(tx, shop.id, usageCycleStart(shop, now)),
      today: await this.store.countHandled(tx, shop.id, startOfDayDhaka(now)),
    }));
  }

  private async mode(): Promise<OrderLimitMode> {
    const setting = await this.settings.current(PlatformSettingKey.OrderLimitMode);
    return setting?.value === OrderLimitMode.Block ? OrderLimitMode.Block : DEFAULT_MODE;
  }
}
