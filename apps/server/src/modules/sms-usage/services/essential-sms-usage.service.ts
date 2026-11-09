import { Inject, Injectable } from '@nestjs/common';
import type { Transaction } from '@lytronix/db';
import {
  LedgerEntryType,
  limitOf,
  SmsKind,
  type SmsLogKind,
  UsageMetric,
} from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { usageCycleStart } from '../../../common/time';
import { BalanceService } from '../../balance/services/balance.service';
import { UsageWarnings } from '../../usage-warnings/services/usage-warnings';
import type { EssentialSmsUsageStore } from '../ports/essential-sms-usage-store';
import { ESSENTIAL_SMS_USAGE_STORE } from '../tokens';
import { SmsUnits } from './sms-units';

/** SMS-06: the shop's balance can't pay for a code past its allowance, so the code isn't made or sent. */
export class ShopCannotPayForCode extends ApiError {
  constructor(readonly units: number) {
    super('quota_exceeded', 'ShopCannotPayForCode', {});
  }
}

export interface EssentialSmsUsage {
  monthly: number;
  total: number;
}

/** What one code took: from the free allowance, from the balance, or both. Given back if it never goes out. */
export interface CodeTaken {
  tenantId: string;
  units: number;
  /** What the balance paid, in taka. */
  cost: string;
  usageId: string | null;
  charge: { id: number; amount: string } | null;
}

/**
 * AUTH-21, SMS-04 to SMS-09 (Slice 7.1, read agreed 2026-11-06): a code that comes from the shop's own use -- a sign-in
 * code to its shop, a staff member's reset code -- is free as far as the shop's allowance reaches, then charged from its
 * balance at the SMS rate, never below zero. When the balance can't pay, the code isn't sent, and the refusal says why
 * (the owner's call, over AUTH-13's same-answer rule). Sign-up codes, the shop-ready SMS and notices to a lapsed shop are
 * platform cost and never come here. Counted in SMS-09's units for both (D7-13).
 */
@Injectable()
export class EssentialSmsUsageService {
  constructor(
    @Inject(ESSENTIAL_SMS_USAGE_STORE) private readonly store: EssentialSmsUsageStore,
    @Inject(UsageWarnings) private readonly warnings: UsageWarnings,
    @Inject(SmsUnits) private readonly smsUnits: SmsUnits,
    @Inject(BalanceService) private readonly balance: BalanceService,
  ) {}

  /** In the transaction that makes the code, so a refusal leaves no code behind. */
  async takeForCode(
    tx: Transaction,
    tenantId: string,
    body: string,
    kind: SmsLogKind,
  ): Promise<CodeTaken> {
    const { units, rate } = await this.smsUnits.priceOf(body);
    await this.store.holdAllowance(tx, tenantId);
    const left = await this.allowanceLeft(tenantId);
    const free = Math.min(units, left);
    const paid = units - free;
    let usageId: string | null = null;
    if (free > 0) {
      usageId = await this.store.record(tx, { tenantId, kind: SmsKind.Otp, units: free });
      await this.warnOf(tx, tenantId, free);
    }
    let charge: CodeTaken['charge'] = null;
    if (paid > 0 && Number(rate) > 0) {
      try {
        charge = await this.balance.charge(tx, {
          tenantId,
          type: LedgerEntryType.Sms,
          units: String(paid),
          rateUsed: rate,
          reference: { kind },
        });
      } catch (error) {
        if (
          error instanceof ApiError &&
          (error.messageKey === 'InsufficientBalance' || error.messageKey === 'BalanceFrozen')
        ) {
          throw new ShopCannotPayForCode(units);
        }
        throw error;
      }
    }
    return {
      tenantId,
      units,
      cost: charge ? charge.amount.replace('-', '') : '0',
      usageId,
      charge,
    };
  }

  /** SMS-08: a code that never went out costs nothing and uses none of the allowance. */
  async giveBack(tx: Transaction, taken: CodeTaken): Promise<void> {
    if (taken.usageId !== null) await this.store.delete(tx, taken.usageId);
    if (taken.charge !== null) {
      await this.balance.credit(tx, {
        tenantId: taken.tenantId,
        type: LedgerEntryType.Reversal,
        amount: taken.charge.amount.replace('-', ''),
        reference: { reverses: taken.charge.id, reason: 'sms_not_sent' },
      });
    }
  }

  /** The units the shop's allowance still covers: a trial's total, else its plan's month (TRL-03, SMS-04). */
  private async allowanceLeft(tenantId: string): Promise<number> {
    const limits = await this.warnings.limitsOf(tenantId);
    const used = await this.currentUsage(tenantId, new Date());
    const limit =
      limits?.essential_sms_total !== undefined
        ? limitOf(limits, 'essential_sms_total')
        : limitOf(limits, 'essential_sms_monthly');
    if (limit === null) return Number.POSITIVE_INFINITY;
    const counted = limits?.essential_sms_total !== undefined ? used.total : used.monthly;
    return Math.max(0, limit - counted);
  }

  /**
   * LIM-01, TRL-03: the free SMS now used, against the shop's allowance -- a trial's total, a plan's month, whichever
   * its limits set. The totals stored do not hold this transaction's own units yet.
   */
  private async warnOf(tx: Transaction, tenantId: string, units: number): Promise<void> {
    const limits = await this.warnings.limitsOf(tenantId);
    const used = await this.currentUsage(tenantId, new Date());
    if (limits?.essential_sms_total !== undefined) {
      await this.warnings.check(tx, {
        tenantId,
        metric: UsageMetric.EssentialSmsTotal,
        used: used.total + units,
        limit: limitOf(limits, 'essential_sms_total'),
      });
    }
    await this.warnings.check(tx, {
      tenantId,
      metric: UsageMetric.EssentialSmsMonthly,
      used: used.monthly + units,
      limit: limitOf(limits, 'essential_sms_monthly'),
    });
  }

  async currentUsage(tenantId: string, now: Date): Promise<EssentialSmsUsage> {
    const tenant = await this.store.findCycleTenant(tenantId);
    const cycleStart = tenant ? usageCycleStart(tenant, now) : now;
    const [monthly, total] = await Promise.all([
      this.store.sumUnitsSince(tenantId, cycleStart),
      this.store.sumUnitsSince(tenantId, null),
    ]);
    return { monthly, total };
  }
}
