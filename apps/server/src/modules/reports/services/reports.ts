import { Inject, Injectable } from '@nestjs/common';
import {
  ConsumerMetric,
  LAPSED_TENANT_STATES,
  PlanPaymentKind,
  SPENT_LEDGER_TYPES,
  TOP_CONSUMERS_LIMIT,
  type ConsumersQuery,
  type LedgerEntryType,
  type ReportQuery,
  type TenantState,
} from '@lytronix/validators';
import { dayPeriodOf, type DayPeriod } from '../../../common/day-period';
import { fromPaisa, toPaisa } from '../../balance/services/money';
import { bucketsOf, type DayRange } from '../../orders/services/sales-buckets';
import type { DayCount, ReportsStore } from '../ports/reports-store';
import { REPORTS_CLOCK, REPORTS_STORE } from '../tokens';

/** The kinds of payment to Lytro's wallets that are earned (D8-40): never a top-up, which is earned when spent. */
export const WALLET_EARNED_KINDS = [
  PlanPaymentKind.Purchase,
  PlanPaymentKind.Renewal,
  PlanPaymentKind.Upgrade,
  PlanPaymentKind.Addon,
] as const;
type WalletKind = (typeof WALLET_EARNED_KINDS)[number];

/** One stretch's earnings, in taka (D8-40). */
export interface RevenueFigures {
  /** Paid to Lytro's wallets, by kind. */
  wallet: Record<WalletKind, string>;
  /** Spent from shops' balances, by ledger type. */
  balance: Partial<Record<LedgerEntryType, string>>;
  /** Reversed charges, taken off. */
  givenBack: string;
  /** Wallet and balance together, less what was given back. */
  earned: string;
}

export interface RevenueReport {
  dateFrom: string;
  dateTo: string;
  buckets: (DayRange & RevenueFigures)[];
  total: RevenueFigures;
  /** The first day shops' balance spending is recorded for (D8-9); none before it is counted. */
  recordedSince: string | null;
}

/** One stretch's movements of shops (D8-41). */
export interface ShopMovements {
  opened: number;
  becamePaying: number;
  lapsed: number;
}

export interface ShopsReport {
  dateFrom: string;
  dateTo: string;
  now: {
    total: number;
    byState: { state: TenantState; count: number }[];
    byPlan: { planId: string | null; planName: string | null; count: number }[];
  };
  buckets: (DayRange & ShopMovements)[];
  total: ShopMovements;
}

export interface ConsumersReport {
  dateFrom: string;
  dateTo: string;
  metric: ConsumerMetric;
  /** The shops that used most, the largest first; bytes for storage and bandwidth, units for SMS. */
  shops: {
    id: string;
    name: string;
    slug: string;
    ownerPhone: string | null;
    value: number;
  }[];
}

const within = (day: string, range: DayRange): boolean => day >= range.from && day <= range.to;

function sumPaisa(rows: readonly { amount: string }[]): bigint {
  return rows.reduce((sum, row) => sum + toPaisa(row.amount), 0n);
}

function countIn(rows: readonly DayCount[], range: DayRange): number {
  return rows.filter((row) => within(row.day, range)).reduce((sum, row) => sum + row.count, 0);
}

/**
 * ADM-09, D8-10, D8-40 to D8-42 (Phase 8 Slice 8.4, read agreed 2026-11-08): the operator's reports over whole Dhaka days,
 * split into Saturday weeks, months, quarters or years as STA-01's figures are. Revenue is what was earned (the owner's
 * pick): plans and add-ons paid to Lytro's wallets, and what shops spent from their balances; a top-up is earned only
 * when spent, so nothing is counted twice. Every figure across shops comes from Lytro's own tables or the shops'
 * recorded days.
 */
@Injectable()
export class Reports {
  constructor(
    @Inject(REPORTS_STORE) private readonly store: ReportsStore,
    @Inject(REPORTS_CLOCK) private readonly clock: () => Date,
  ) {}

  async revenue(query: ReportQuery): Promise<RevenueReport> {
    const period = this.periodOf(query);
    const [wallet, spend, givenBack] = await Promise.all([
      this.store.walletEarnedByDay(period.from, period.to),
      this.store.spendByDay(period.dateFrom, period.dateTo),
      this.store.givenBackByDay(period.dateFrom, period.dateTo),
    ]);
    const figures = (range: DayRange): RevenueFigures => {
      const walletIn = wallet.filter((row) => within(row.day, range));
      const spendIn = spend.filter((row) => within(row.day, range));
      const back = sumPaisa(givenBack.filter((row) => within(row.day, range)));
      const byKind = Object.fromEntries(
        WALLET_EARNED_KINDS.map((kind) => [
          kind,
          fromPaisa(sumPaisa(walletIn.filter((row) => row.kind === kind))),
        ]),
      ) as Record<WalletKind, string>;
      const balance: Partial<Record<LedgerEntryType, string>> = {};
      for (const type of SPENT_LEDGER_TYPES) {
        const total = sumPaisa(spendIn.filter((row) => row.type === type));
        if (total > 0n) balance[type] = fromPaisa(total);
      }
      return {
        wallet: byKind,
        balance,
        givenBack: fromPaisa(back),
        earned: fromPaisa(sumPaisa(walletIn) + sumPaisa(spendIn) - back),
      };
    };
    const whole = { from: period.dateFrom, to: period.dateTo };
    const recorded = [...spend.map((row) => row.day), ...givenBack.map((row) => row.day)].sort();
    return {
      dateFrom: period.dateFrom,
      dateTo: period.dateTo,
      buckets: bucketsOf(whole, query.bucket).map((range) => ({ ...range, ...figures(range) })),
      total: figures(whole),
      recordedSince: recorded[0] ?? null,
    };
  }

  async shops(query: ReportQuery): Promise<ShopsReport> {
    const period = this.periodOf(query);
    const [counts, opened, paid, lapsed] = await Promise.all([
      this.store.countsNow(),
      this.store.openedByDay(period.from, period.to),
      this.store.firstPaidByDay(period.from, period.to),
      this.store.movedIntoByDay(period.dateFrom, period.dateTo, LAPSED_TENANT_STATES),
    ]);
    const movements = (range: DayRange): ShopMovements => ({
      opened: countIn(opened, range),
      becamePaying: countIn(paid, range),
      lapsed: countIn(lapsed, range),
    });
    const byState = new Map<TenantState, number>();
    const byPlan = new Map<
      string,
      { planId: string | null; planName: string | null; count: number }
    >();
    for (const row of counts) {
      byState.set(row.state, (byState.get(row.state) ?? 0) + row.count);
      const key = row.planId ?? '';
      const plan = byPlan.get(key) ?? { planId: row.planId, planName: row.planName, count: 0 };
      plan.count += row.count;
      byPlan.set(key, plan);
    }
    const whole = { from: period.dateFrom, to: period.dateTo };
    return {
      dateFrom: period.dateFrom,
      dateTo: period.dateTo,
      now: {
        total: counts.reduce((sum, row) => sum + row.count, 0),
        byState: [...byState].map(([state, count]) => ({ state, count })),
        byPlan: [...byPlan.values()],
      },
      buckets: bucketsOf(whole, query.bucket).map((range) => ({ ...range, ...movements(range) })),
      total: movements(whole),
    };
  }

  async consumers(query: ConsumersQuery): Promise<ConsumersReport> {
    const period = this.periodOf(query);
    const top = await (query.metric === ConsumerMetric.Storage
      ? this.store.storageTop(period.dateFrom, period.dateTo, TOP_CONSUMERS_LIMIT)
      : query.metric === ConsumerMetric.Bandwidth
        ? this.store.bandwidthTop(period.dateFrom, period.dateTo, TOP_CONSUMERS_LIMIT)
        : this.store.smsTop(period.dateFrom, period.dateTo, TOP_CONSUMERS_LIMIT));
    const shops = new Map(
      (await this.store.shopsByIds(top.map((row) => row.tenantId))).map((shop) => [shop.id, shop]),
    );
    return {
      dateFrom: period.dateFrom,
      dateTo: period.dateTo,
      metric: query.metric,
      shops: top.flatMap((row) => {
        const shop = shops.get(row.tenantId);
        return shop ? [{ ...shop, value: row.value }] : [];
      }),
    };
  }

  private periodOf(query: {
    dateFrom?: string | undefined;
    dateTo?: string | undefined;
  }): DayPeriod {
    return dayPeriodOf(query, this.clock());
  }
}
