import { Inject, Injectable } from '@nestjs/common';
import type { Transaction } from '@lytronix/db';
import {
  AuditResult,
  LedgerEntryType,
  PlatformActorType,
  PlatformAuditAction,
} from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { PlatformAuditService } from '../../audit/services/platform-audit.service';
import { TenantService } from '../../tenancy/services/tenant.service';
import type { BalanceLedgerStore, LedgerFilters } from '../ports/balance-ledger-store';
import type { LowBalanceNotifier } from '../ports/low-balance-notifier';
import { BALANCE_LEDGER_STORE, CLOCK, LOW_BALANCE_NOTIFIER } from '../tokens';
import type { BalanceSnapshot, LedgerEntry, LedgerPage } from '../types/ledger-entry';
import { fromPaisa, toPaisa } from './money';

// D2-11: these are the only ledger entries that count as pay-as-you-go "activity" for PYG-21's inactivity clock.
const ACTIVITY_TYPES: ReadonlySet<LedgerEntryType> = new Set([
  LedgerEntryType.OrderFee,
  LedgerEntryType.ProductFee,
  LedgerEntryType.TopUp,
]);

// BAL-13: low-balance thresholds, in paisa, checked as a downward crossing (never repeated while already past).
const LOW_BALANCE_THRESHOLDS_PAISA: readonly bigint[] = [5000n, 0n];

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
    @Inject(LOW_BALANCE_NOTIFIER) private readonly notifier: LowBalanceNotifier,
    @Inject(CLOCK) private readonly clock: () => Date,
  ) {}

  runStandalone<T>(tenantId: string, work: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.ledger.run(tenantId, work);
  }

  charge(tx: Transaction, input: ChargeInput): Promise<LedgerEntry> {
    return this.applyDelta(tx, input.tenantId, {
      type: input.type,
      signedAmount: `-${this.amountOf(input)}`,
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
      throw new ApiError('validation_error', 'A reason is required.', { field: 'reason' });
    }
    const entry = await this.runStandalone(input.tenantId, (tx) =>
      this.applyDelta(tx, input.tenantId, {
        type: LedgerEntryType.Adjustment,
        signedAmount: input.amount,
        reference: { reason: input.reason, operatorId: input.operatorId },
        // An operator adjustment is itself the authority for crossing BAL-10's floor; it is a correction, not an
        // ordinary spend, and never reversed automatically.
        overdraftFloor: undefined,
      }),
    );
    await this.platformAudit.record({
      actorType: PlatformActorType.Operator,
      actorId: input.operatorId,
      action: PlatformAuditAction.BalanceAdjusted,
      targetType: 'tenant',
      targetId: input.tenantId,
      result: AuditResult.Success,
      ip: null,
      summary: { amount: input.amount, reason: input.reason },
    });
    return entry;
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
      const row = await this.tenants.lockBalanceForUpdate(tx, tenantId);
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

  private amountOf(input: ChargeInput): string {
    if (input.units !== undefined && input.rateUsed !== undefined) {
      if (input.amount !== undefined) {
        throw new Error('provide either amount or units+rateUsed, not both');
      }
      const paisa = (toPaisa(input.units) * toPaisa(input.rateUsed)) / 100n;
      return fromPaisa(paisa);
    }
    if (input.amount === undefined) throw new Error('provide amount or units+rateUsed');
    return input.amount;
  }

  /**
   * The one place every balance change actually happens (BAL-02, BAL-11): locks the tenant row, checks frozen
   * (BAL-07/08) and the overdraft floor (BAL-10), writes the ledger row and the new balance together, then
   * fires the low-balance notice (BAL-13) if a threshold was crossed downward. `signedAmount` is already signed
   * — negative for a charge, positive for a credit.
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
      throw new ApiError('tenant_offline', 'The balance is frozen.', {});
    }
    const beforePaisa = toPaisa(balance.amount);
    const deltaPaisa = toPaisa(input.signedAmount);
    const afterPaisa = beforePaisa + deltaPaisa;
    if (input.overdraftFloor !== undefined && afterPaisa < toPaisa(input.overdraftFloor)) {
      throw new ApiError('quota_exceeded', 'Insufficient balance.', { balance: balance.amount });
    }
    const afterAmount = fromPaisa(afterPaisa);
    const entry = await this.ledger.insert(tx, {
      tenantId,
      type: input.type,
      amount: input.signedAmount,
      balanceAfter: afterAmount,
      units: input.units ?? null,
      rateUsed: input.rateUsed ?? null,
      reference: input.reference ?? null,
    });
    await this.tenants.applyBalanceChange(tx, tenantId, afterAmount, {
      touchActivityAt: ACTIVITY_TYPES.has(input.type) ? this.clock() : undefined,
    });
    await this.checkLowBalanceCrossing(tenantId, beforePaisa, afterPaisa, afterAmount);
    return entry;
  }

  private async checkLowBalanceCrossing(
    tenantId: string,
    beforePaisa: bigint,
    afterPaisa: bigint,
    afterAmount: string,
  ): Promise<void> {
    for (const threshold of LOW_BALANCE_THRESHOLDS_PAISA) {
      if (beforePaisa >= threshold && afterPaisa < threshold) {
        await this.notifier.notifyCrossed(tenantId, threshold, afterAmount);
      }
    }
  }
}
