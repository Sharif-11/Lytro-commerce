import { Inject, Injectable } from '@nestjs/common';
import type { Transaction } from '@lytronix/db';
import {
  ActorType,
  AuditAction,
  AuditResult,
  LedgerEntryType,
  PlatformActorType,
  PlatformAuditAction,
  FieldProblemCode,
} from '@lytronix/validators';
import { ApiError, FieldsError } from '../../../common/api-error';
import { AuditService } from '../../audit/services/audit.service';
import { PlatformAuditService } from '../../audit/services/platform-audit.service';
import { TenantService } from '../../tenancy/services/tenant.service';
import type { BalanceLedgerStore, LedgerFilters } from '../ports/balance-ledger-store';
import type { LowBalanceNotifier } from '../ports/low-balance-notifier';
import { BALANCE_LEDGER_STORE, CLOCK, LOW_BALANCE_NOTIFIER } from '../tokens';
import type { BalanceSnapshot, LedgerEntry, LedgerPage } from '../types/ledger-entry';
import { fromPaisa, toPaisa, unitsTimesRate } from './money';

// D2-11: these are the only ledger entries that count as pay-as-you-go "activity" for PYG-21's inactivity clock.
const ACTIVITY_TYPES: ReadonlySet<LedgerEntryType> = new Set([
  LedgerEntryType.OrderFee,
  LedgerEntryType.ProductFee,
  LedgerEntryType.TopUp,
]);

// BAL-13: low-balance thresholds, in paisa. A charge crosses one when it brings the balance from above it to it or
// below -- reaching exactly 0 counts, since BAL-10 stops most charges there -- never repeated while already past.
const LOW_BALANCE_THRESHOLDS_PAISA: readonly bigint[] = [5000n, 0n];

// BAL-14: a CSV covers the whole filtered range, not one page -- capped so one tenant's statement can't
// produce an unbounded response.
const EXPORT_ROW_CAP = 10000;

export interface ChargeInput {
  tenantId: string;
  type: LedgerEntryType;
  reference?: unknown;
  /** SMS-06: how far this specific charge may take the balance negative. Default 0 (BAL-10). */
  overdraftFloor?: string;
  /** Provide either this (a flat amount) or units + rateUsed, never both (BAL-16). */
  amount?: string;
  units?: string;
  rateUsed?: string;
}

export interface CreditInput {
  tenantId: string;
  type: LedgerEntryType;
  amount: string;
  reference?: unknown;
}

/**
 * The balance ledger (BAL-01 to BAL-18): atomic charge/credit, freeze/unfreeze, statement reads, operator
 * adjustments. Every write joins the caller's own transaction (`tx`) when one is given — a charge is never its
 * own transaction apart from whatever business action triggered it (e.g. a courier booking, PYG-02). A method
 * ending in `Standalone` opens its own transaction, for a caller — this module's own controllers, today — that
 * has no transaction open yet.
 */
@Injectable()
export class BalanceService {
  constructor(
    @Inject(BALANCE_LEDGER_STORE) private readonly ledger: BalanceLedgerStore,
    @Inject(TenantService) private readonly tenants: TenantService,
    @Inject(PlatformAuditService) private readonly platformAudit: PlatformAuditService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(LOW_BALANCE_NOTIFIER) private readonly notifier: LowBalanceNotifier,
    @Inject(CLOCK) private readonly clock: () => Date,
  ) {}

  runStandalone<T>(tenantId: string, work: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.ledger.run(tenantId, work);
  }

  async charge(tx: Transaction, input: ChargeInput): Promise<LedgerEntry> {
    const paisa = this.paisaOf(input);
    // BAL-02: an entry is a balance change. Nothing to charge is a caller's mistake, never an empty entry, and a
    // negative charge would be a credit in disguise.
    if (paisa <= 0n) {
      throw new Error('charge amount must be positive');
    }
    return this.applyDelta(tx, input.tenantId, {
      type: input.type,
      signedAmount: fromPaisa(-paisa),
      reference: input.reference,
      units: input.units,
      rateUsed: input.rateUsed,
      overdraftFloor: input.overdraftFloor ?? '0',
    });
  }

  chargeStandalone(input: ChargeInput): Promise<LedgerEntry> {
    return this.runStandalone(input.tenantId, (tx) => this.charge(tx, input));
  }

  credit(tx: Transaction, input: CreditInput): Promise<LedgerEntry> {
    if (toPaisa(input.amount) <= 0n) {
      throw new Error('credit amount must be positive');
    }
    return this.applyDelta(tx, input.tenantId, {
      type: input.type,
      signedAmount: input.amount,
      reference: input.reference,
      // A credit never pushes the balance below where it already was, so the floor is irrelevant; pass the
      // most permissive floor so the shared guard never fires.
      overdraftFloor: undefined,
    });
  }

  creditStandalone(input: CreditInput): Promise<LedgerEntry> {
    return this.runStandalone(input.tenantId, (tx) => this.credit(tx, input));
  }

  /** BAL-17: an operator's correction. `amount` is signed; an empty reason is refused before any write. */
  async adjustStandalone(input: {
    tenantId: string;
    amount: string;
    reason: string;
    operatorId: string;
  }): Promise<LedgerEntry> {
    if (input.reason.trim().length === 0) {
      throw new FieldsError([{ field: 'reason', problem: FieldProblemCode.Required }]);
    }
    const entry = await this.runStandalone(input.tenantId, async (tx) => {
      const applied = await this.applyDelta(tx, input.tenantId, {
        type: LedgerEntryType.Adjustment,
        signedAmount: input.amount,
        reference: { reason: input.reason, operatorId: input.operatorId },
        // An operator adjustment is itself the authority for crossing BAL-10's floor; it is a correction, not an
        // ordinary spend, and never reversed automatically.
        overdraftFloor: undefined,
      });
      // AUD-08, ADM-04: the shop sees the correction in its own activity log as "Platform support", with the
      // reason, in the same transaction as the ledger entry.
      await this.audit.record(tx, {
        tenantId: input.tenantId,
        actorType: ActorType.PlatformSupport,
        actorId: null,
        action: AuditAction.BalanceAdjusted,
        targetType: 'tenant',
        targetId: input.tenantId,
        result: AuditResult.Success,
        summary: { amount: input.amount, reason: input.reason },
      });
      // ADM-08: the platform's own record joins the same transaction, so no adjustment ever stands unrecorded.
      await this.platformAudit.recordWithin(tx, {
        actorType: PlatformActorType.Operator,
        actorId: input.operatorId,
        action: PlatformAuditAction.BalanceAdjusted,
        targetType: 'tenant',
        targetId: input.tenantId,
        result: AuditResult.Success,
        ip: null,
        summary: { amount: input.amount, reason: input.reason },
      });
      return applied;
    });
    return entry;
  }

  /**
   * LIF-20/21, BAL-18: when an owner whose shop was deleted opens a new one, each deleted shop's remaining
   * balance moves into it -- one `carry_over` entry on each side, each naming the other shop, in the caller's own
   * transaction (the new shop's creation). The deleted shop's balance is frozen; this move is the one exception,
   * since it is not a spend, and no low-balance notice fires for a shop that no longer exists. A balance at or
   * below zero stays where it is. The deleted shop's row is locked first, so two new shops opened at once can never
   * both move the same balance; each entry's own insert then locks and moves its shop's balance.
   */
  async carryOverFromDeletedShops(
    tx: Transaction,
    subscriberId: string,
    toTenantId: string,
  ): Promise<void> {
    const sources = await this.tenants.findDeletedShopsOf(tx, subscriberId);
    for (const source of sources) {
      const from = await this.tenants.lockBalanceForUpdate(tx, source.id);
      if (!from || toPaisa(from.amount) <= 0n) continue;
      await this.ledger.insert(tx, {
        tenantId: source.id,
        type: LedgerEntryType.CarryOver,
        amount: fromPaisa(-toPaisa(from.amount)),
        reference: { toTenantId },
      });
      await this.ledger.insert(tx, {
        tenantId: toTenantId,
        type: LedgerEntryType.CarryOver,
        amount: from.amount,
        reference: { fromTenantId: source.id },
      });
    }
  }

  /** BAL-07/09: makes the balance usable again (plan purchase, pay-as-you-go activation). */
  freeze(tx: Transaction, tenantId: string): Promise<void> {
    return this.tenants.setBalanceFrozen(tx, tenantId, true);
  }

  unfreeze(tx: Transaction, tenantId: string): Promise<void> {
    return this.tenants.setBalanceFrozen(tx, tenantId, false);
  }

  /** BAL-01, BAL-08: the current amount and whether it is frozen. */
  async current(tenantId: string): Promise<BalanceSnapshot> {
    return this.runStandalone(tenantId, async (tx) => {
      // A read takes no lock, so a balance page never waits behind a charge, nor holds one up.
      const row = await this.tenants.findBalance(tx, tenantId);
      if (!row) throw new Error('tenant not found');
      return { amount: row.amount, frozen: row.frozen };
    });
  }

  /** BAL-14: the statement, newest first, keyset-paginated. */
  async statement(
    tenantId: string,
    filters: LedgerFilters,
    cursor: number | null,
    limit: number,
  ): Promise<LedgerPage> {
    const rows = await this.runStandalone(tenantId, (tx) =>
      this.ledger.list(tx, tenantId, filters, cursor, limit + 1),
    );
    const hasMore = rows.length > limit;
    const entries = hasMore ? rows.slice(0, limit) : rows;
    const last = entries[entries.length - 1];
    return { entries, nextCursor: hasMore && last ? last.id : null };
  }

  /** BAL-14: the whole filtered range for a CSV export, not one page -- reuses `statement`'s own store read,
   * just with no cursor and a cap generous enough to never silently truncate a real tenant's statement. */
  statementAll(tenantId: string, filters: LedgerFilters): Promise<LedgerEntry[]> {
    return this.runStandalone(tenantId, (tx) =>
      this.ledger.list(tx, tenantId, filters, null, EXPORT_ROW_CAP),
    );
  }

  private paisaOf(input: ChargeInput): bigint {
    if (input.units !== undefined && input.rateUsed !== undefined) {
      if (input.amount !== undefined) {
        throw new Error('provide either amount or units+rateUsed, not both');
      }
      return unitsTimesRate(input.units, input.rateUsed);
    }
    if (input.amount === undefined) throw new Error('provide amount or units+rateUsed');
    return toPaisa(input.amount);
  }

  /**
   * The one place every balance change actually happens (BAL-02, BAL-11): locks the tenant row, checks frozen
   * (BAL-07/08) and the overdraft floor (BAL-10), and writes the ledger entry. The entry's insert is the balance
   * change: the database moves the balance and fills balance_after from the row this lock holds, and refuses any
   * other change to it (migration 0055). Then fires the low-balance notice (BAL-13) if a threshold was crossed
   * downward. `signedAmount` is already signed — negative for a charge, positive for a credit.
   */
  private async applyDelta(
    tx: Transaction,
    tenantId: string,
    input: {
      type: LedgerEntryType;
      signedAmount: string;
      reference?: unknown;
      units?: string;
      rateUsed?: string;
      overdraftFloor?: string;
    },
  ): Promise<LedgerEntry> {
    const balance = await this.tenants.lockBalanceForUpdate(tx, tenantId);
    if (!balance) throw new Error('tenant not found');
    if (balance.frozen) {
      throw new ApiError('tenant_offline', 'BalanceFrozen', {});
    }
    const beforePaisa = toPaisa(balance.amount);
    const deltaPaisa = toPaisa(input.signedAmount);
    const afterPaisa = beforePaisa + deltaPaisa;
    if (input.overdraftFloor !== undefined && afterPaisa < toPaisa(input.overdraftFloor)) {
      throw new ApiError('quota_exceeded', 'InsufficientBalance', { balance: balance.amount });
    }
    const entry = await this.ledger.insert(tx, {
      tenantId,
      type: input.type,
      amount: input.signedAmount,
      units: input.units ?? null,
      rateUsed: input.rateUsed ?? null,
      reference: input.reference ?? null,
    });
    if (ACTIVITY_TYPES.has(input.type)) {
      await this.tenants.touchActivity(tx, tenantId, this.clock());
    }
    await this.checkLowBalanceCrossing(
      tx,
      tenantId,
      beforePaisa,
      toPaisa(entry.balanceAfter),
      entry.balanceAfter,
    );
    return entry;
  }

  private async checkLowBalanceCrossing(
    tx: Transaction,
    tenantId: string,
    beforePaisa: bigint,
    afterPaisa: bigint,
    afterAmount: string,
  ): Promise<void> {
    for (const threshold of LOW_BALANCE_THRESHOLDS_PAISA) {
      if (beforePaisa > threshold && afterPaisa <= threshold) {
        await this.notifier.notifyCrossed(tx, tenantId, threshold, afterAmount);
      }
    }
  }
}
