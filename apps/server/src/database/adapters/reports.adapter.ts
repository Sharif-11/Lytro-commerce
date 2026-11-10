import { Inject, Injectable } from '@nestjs/common';
import {
  BalanceLedgerRepository,
  ReportsRepository,
  ShopDayRepository,
  SmsLogRepository,
  TenantRepository,
  TransactionRunner,
  type ReportShopRow,
  type ShopCountRow,
  type ShopDayRow,
  type ShopFigure,
} from '@lytronix/db';
import type { LedgerEntryType, PlanPaymentKind, TenantState } from '@lytronix/validators';
import type { DayCount, ReportsStore } from '../../modules/reports/ports/reports-store';
import type { LedgerTotals, ShopDayStore } from '../../modules/reports/ports/shop-day-store';
import { DatabaseService } from '../database.service';

/** D8-9: the night's reads of each shop, inside its own row-level security, and its writes of the shop's day. */
@Injectable()
export class DrizzleShopDayStore implements ShopDayStore {
  constructor(
    @Inject(DatabaseService) private readonly database: Pick<DatabaseService, 'handle'>,
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(TenantRepository) private readonly tenants: TenantRepository,
    @Inject(ShopDayRepository) private readonly days: ShopDayRepository,
    @Inject(BalanceLedgerRepository) private readonly ledger: BalanceLedgerRepository,
    @Inject(SmsLogRepository) private readonly sms: SmsLogRepository,
  ) {}

  shopIds(): Promise<string[]> {
    return this.tenants.listLiveIds(this.database.handle.db);
  }

  recorded(tenantId: string, days: readonly string[]): Promise<Set<string>> {
    return this.days.recorded(this.database.handle.db, tenantId, days);
  }

  record(row: ShopDayRow): Promise<void> {
    return this.days.upsert(this.database.handle.db, row);
  }

  ledgerTotals(tenantId: string, from: Date, to: Date): Promise<LedgerTotals[]> {
    return this.transactions.run(this.database.handle.db, (tx) =>
      this.ledger.totalsBetween(tx, tenantId, from, to),
    );
  }

  smsUnits(tenantId: string, from: Date, to: Date): Promise<number> {
    return this.transactions.run(this.database.handle.db, async (tx) =>
      (await this.sms.report(tx, tenantId, from, to)).reduce((sum, row) => sum + row.units, 0),
    );
  }
}

/** ADM-09, D8-10: the reports' figures, from Lytro's own tables and the shops' recorded days. */
@Injectable()
export class DrizzleReportsStore implements ReportsStore {
  constructor(
    @Inject(DatabaseService) private readonly database: Pick<DatabaseService, 'handle'>,
    @Inject(ReportsRepository) private readonly reports: ReportsRepository,
    @Inject(ShopDayRepository) private readonly days: ShopDayRepository,
  ) {}

  private get db() {
    return this.database.handle.db;
  }

  manualByDay(
    from: Date,
    to: Date,
  ): Promise<{ day: string; kind: PlanPaymentKind; reversal: boolean; amount: string }[]> {
    return this.reports.manualByDay(this.db, from, to);
  }

  walletEarnedByDay(
    from: Date,
    to: Date,
  ): Promise<{ day: string; kind: PlanPaymentKind; amount: string }[]> {
    return this.reports.walletEarnedByDay(this.db, from, to);
  }

  spendByDay(
    from: string,
    to: string,
  ): Promise<{ day: string; type: LedgerEntryType; amount: string }[]> {
    return this.days.spendByDay(this.db, from, to);
  }

  givenBackByDay(from: string, to: string): Promise<{ day: string; amount: string }[]> {
    return this.days.givenBackByDay(this.db, from, to);
  }

  openedByDay(from: Date, to: Date): Promise<DayCount[]> {
    return this.reports.openedByDay(this.db, from, to);
  }

  firstPaidByDay(from: Date, to: Date): Promise<DayCount[]> {
    return this.reports.firstPaidByDay(this.db, from, to);
  }

  movedIntoByDay(from: string, to: string, states: readonly TenantState[]): Promise<DayCount[]> {
    return this.days.movedIntoByDay(this.db, from, to, states);
  }

  countsNow(): Promise<ShopCountRow[]> {
    return this.reports.countsNow(this.db);
  }

  smsTop(from: string, to: string, limit: number): Promise<ShopFigure[]> {
    return this.days.smsTop(this.db, from, to, limit);
  }

  storageTop(from: string, to: string, limit: number): Promise<ShopFigure[]> {
    return this.days.storageTop(this.db, from, to, limit);
  }

  bandwidthTop(from: string, to: string, limit: number): Promise<ShopFigure[]> {
    return this.reports.bandwidthTop(this.db, from, to, limit);
  }

  shopsByIds(ids: readonly string[]): Promise<ReportShopRow[]> {
    return this.reports.shopsByIds(this.db, ids);
  }
}
