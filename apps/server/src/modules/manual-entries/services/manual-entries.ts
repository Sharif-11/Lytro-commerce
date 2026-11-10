import { Inject, Injectable } from '@nestjs/common';
import type {
  ManualEntryAfter,
  ManualEntryBefore,
  ManualEntryRow,
  SelectManualPaymentEntry,
  Transaction,
} from '@lytronix/db';
import {
  ActorType,
  AuditAction,
  AuditResult,
  InvoiceKind,
  InvoiceLineKind,
  MANUAL_ENTRY_CONFIRM_ABOVE_TAKA,
  MANUAL_ENTRY_DAILY_ENTRIES,
  ManualEntryKind,
  NotificationKind,
  PlanPaymentKind,
  PlanPaymentStatus,
  PlatformActorType,
  PlatformAuditAction,
  ServerFieldProblemCode,
  TenantState,
  type ManualEntryInput,
  type ManualEntryListQuery,
  type ManualEntryPreviewInput,
} from '@lytronix/validators';
import { ApiError, FieldsError } from '../../../common/api-error';
import { DAY_MS, dhakaDayStart, startOfDayDhaka } from '../../../common/time';
import { AuditService } from '../../audit/services/audit.service';
import { PlatformAuditService } from '../../audit/services/platform-audit.service';
import { BalanceService } from '../../balance/services/balance.service';
import { fromPaisa, toPaisa } from '../../balance/services/money';
import { TopUpService } from '../../balance/services/top-up.service';
import { AddonRenewalService } from '../../billing/services/addon-renewal.service';
import {
  manualEntryRecordedWords,
  manualEntryReversedWords,
} from '../../billing/services/billing-notice-words';
import { DowngradeService } from '../../billing/services/downgrade.service';
import { PaymentQueueService } from '../../billing/services/payment-queue.service';
import { PurchaseService } from '../../billing/services/purchase.service';
import { UpgradeService } from '../../billing/services/upgrade.service';
import type { AddonCarry } from '../../billing/types/addon';
import { NOTIFICATION_LINKS } from '../../notifications/notification-words';
import { AccountNotices } from '../../notifications/services/account-notices';
import {
  PaymentEvidence,
  type EvidenceLink,
} from '../../payment-evidence/services/payment-evidence';
import { InvoicesService } from '../../payments/services/invoices.service';
import { PlanPaymentsService } from '../../payments/services/plan-payments.service';
import type { PlanPaymentRecord } from '../../payments/types/plan-payment';
import { TenantService } from '../../tenancy/services/tenant.service';
import type { ManualEntriesStore } from '../ports/manual-entries-store';
import { MANUAL_ENTRIES_CLOCK, MANUAL_ENTRIES_STORE } from '../tokens';

/** What a manual entry would be for this shop now: priced by the same code as the seller's own request (D8-51). */
interface PricedEntry {
  kind: PlanPaymentKind;
  planId: string | null;
  billingTermId: string | null;
  amount: string;
  creditAmount: string;
  carries: readonly AddonCarry[];
  /** Where the add-ons it carries end, and whether they extend ones already running (an upgrade). */
  ends: { expiresAt: Date; extending: boolean } | null;
}

export interface ManualEntryPreview {
  kind: PlanPaymentKind;
  amount: string;
  creditAmount: string;
  addons: { key: string; labelEn: string; labelBn: string; quantity: number; price: string }[];
  periodEnd: Date | null;
  /** ADM-15: whether the amount would have to be typed again. */
  needsConfirmation: boolean;
}

/** An entry or a reversal as the operator reads it. */
export type ManualEntryView = ManualEntryRow;

export interface ManualEntryPage {
  entries: ManualEntryRow[];
  total: number;
  page: number;
  limit: number;
}

type EntryTarget = Pick<ManualEntryPreviewInput, 'tenantId' | 'kind' | 'planId' | 'billingTermId'>;

/**
 * ADM-14, ADM-15, D8-14, D8-47 to D8-56 (Phase 8 Slice 8.5, read agreed 2026-11-09): a payment that reached Lytro outside the
 * normal flow, recorded by the operator and activated by the very code that approves one in the queue
 * (`PaymentQueueService.verifyWithin`), so it makes the same ledger entries, plan snapshot and invoice. An entry is never
 * changed: a mistake is corrected by a reversing entry, which puts the shop back as it stood.
 */
@Injectable()
export class ManualEntries {
  constructor(
    @Inject(MANUAL_ENTRIES_STORE) private readonly store: ManualEntriesStore,
    @Inject(PurchaseService) private readonly purchase: PurchaseService,
    @Inject(UpgradeService) private readonly upgrade: UpgradeService,
    @Inject(TopUpService) private readonly topUp: TopUpService,
    @Inject(AddonRenewalService) private readonly renewals: AddonRenewalService,
    @Inject(DowngradeService) private readonly downgrade: DowngradeService,
    @Inject(PlanPaymentsService) private readonly payments: PlanPaymentsService,
    @Inject(PaymentQueueService) private readonly queue: PaymentQueueService,
    @Inject(InvoicesService) private readonly invoices: InvoicesService,
    @Inject(BalanceService) private readonly balance: BalanceService,
    @Inject(TenantService) private readonly tenants: TenantService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(PlatformAuditService) private readonly platformAudit: PlatformAuditService,
    @Inject(AccountNotices) private readonly notices: AccountNotices,
    @Inject(PaymentEvidence) private readonly evidence: PaymentEvidence,
    @Inject(MANUAL_ENTRIES_CLOCK) private readonly clock: () => Date,
  ) {}

  /** What the entry would be, so the operator sees the amount and the add-ons before saving. */
  async preview(input: ManualEntryPreviewInput): Promise<ManualEntryPreview> {
    await this.assertShopOpen(input.tenantId);
    const priced = await this.priced(input, input.amount?.toFixed(2) ?? '0.00');
    return {
      kind: priced.kind,
      amount: priced.amount,
      creditAmount: priced.creditAmount,
      addons: priced.carries.map(({ from, price }) => ({
        key: from.key,
        labelEn: from.labelEn,
        labelBn: from.labelBn,
        quantity: from.quantity,
        price,
      })),
      periodEnd: priced.ends?.expiresAt ?? null,
      needsConfirmation: await this.needsConfirmation(priced.amount),
    };
  }

  async record(
    input: ManualEntryInput,
    operatorId: string,
    ip: string | null,
  ): Promise<ManualEntryRow> {
    const now = this.clock();
    if (input.paidAt.getTime() > now.getTime()) {
      throw new ApiError('validation_error', 'ManualEntryPaidInFuture', {});
    }
    await this.assertShopOpen(input.tenantId);
    if (!(await this.store.walletExists(input.walletId))) {
      throw new ApiError('not_found', 'PlatformWalletNotFound', {});
    }
    const amount = input.amount.toFixed(2);
    const priced = await this.priced(input, amount);
    // D8-51: a plan is sold at today's price only; if the money differs, it is recorded as a top-up.
    if (toPaisa(amount) !== toPaisa(priced.amount)) {
      throw new ApiError('conflict', 'AmountChanged', { amount: priced.amount }, undefined, {
        amount: priced.amount,
      });
    }
    await this.assertConfirmed(input, amount);

    const entryId = await this.evidence.withKept(
      { tenantId: input.tenantId, uploader: 'operator' },
      input.evidenceKey,
      (evidenceId) =>
        this.tenants.runStandalone((tx) =>
          this.recordWithin(tx, input, priced, evidenceId, operatorId, ip, now),
        ),
    );
    return this.viewOf(entryId);
  }

  /** ADM-15: the reversing entry. The original stays; the shop goes back as it stood before it. */
  async reverse(
    id: string,
    reason: string,
    operatorId: string,
    ip: string | null,
  ): Promise<ManualEntryRow> {
    const now = this.clock();
    const reversalId = await this.tenants.runStandalone(async (tx) => {
      const entry = await this.store.findById(tx, id);
      if (!entry) throw new ApiError('not_found', 'ManualEntryNotFound', {});
      if (entry.reversesEntryId !== null) {
        throw new ApiError('conflict', 'ManualEntryIsReversal', {});
      }
      const payment = await this.payments.findForUpdate(tx, entry.planPaymentId);
      if (payment?.status !== PlanPaymentStatus.Verified) {
        throw new ApiError('conflict', 'ManualEntryAlreadyReversed', {});
      }
      const standing = await this.tenants.planStanding(tx, entry.tenantId);
      if (!standing || standing.state === TenantState.Deleted) {
        throw new ApiError('conflict', 'ManualEntryShopGone', {});
      }

      if (entry.kind === PlanPaymentKind.TopUp) {
        await this.balance.takeBack(tx, {
          tenantId: entry.tenantId,
          amount: entry.amount,
          reference: { manualEntryId: entry.id, reason, operatorId },
        });
      } else {
        // D8-48: only while the shop is still on what this entry gave it; a later payment, an extension or a downgrade
        // would otherwise be wiped out.
        const after = entry.after;
        if (!after || standing.planId !== after.planId || standing.periodEnd !== after.periodEnd) {
          throw new ApiError('conflict', 'ManualEntryPlanMovedOn', {});
        }
        await this.undoPlan(tx, entry, payment);
      }

      await this.payments.reverseWithin(tx, payment.id, operatorId, now, reason);
      const reversal = await this.store.insert(tx, {
        tenantId: entry.tenantId,
        planPaymentId: entry.planPaymentId,
        kind: entry.kind,
        amount: entry.amount,
        reason,
        enteredBy: operatorId,
        reversesEntryId: entry.id,
      });
      await this.tellEveryone(tx, entry, reason, operatorId, ip, reversal.id);
      return reversal.id;
    });
    return this.viewOf(reversalId);
  }

  /** D8-55: every entry and reversal, newest first, by shop, operator and day. */
  async list(query: ManualEntryListQuery): Promise<ManualEntryPage> {
    const { entries, total } = await this.store.list({
      tenantId: query.tenantId,
      operatorId: query.operatorId,
      from: query.dateFrom ? dhakaDayStart(query.dateFrom) : undefined,
      to: query.dateTo ? new Date(dhakaDayStart(query.dateTo).getTime() + DAY_MS) : undefined,
      page: query.page,
      limit: query.limit,
    });
    return { entries, total, page: query.page, limit: query.limit };
  }

  /** D8-47: a short link to an entry's screenshot, for the operator. */
  async evidenceLink(id: string): Promise<EvidenceLink> {
    const entry = await this.tenants.runStandalone((tx) => this.store.findById(tx, id));
    if (!entry) throw new ApiError('not_found', 'ManualEntryNotFound', {});
    if (entry.evidenceId === null) throw new ApiError('not_found', 'EvidenceNotFound', {});
    return this.evidence.link(entry.evidenceId);
  }

  private async recordWithin(
    tx: Transaction,
    input: ManualEntryInput,
    priced: PricedEntry,
    evidenceId: string | null,
    operatorId: string,
    ip: string | null,
    now: Date,
  ): Promise<string> {
    const reusing = await this.reusesReversedId(tx, input.transactionId);
    const before = await this.beforeOf(tx, input.tenantId, priced.kind);
    if (
      priced.kind === PlanPaymentKind.Upgrade &&
      (await this.payments.findSubmittedOpen(tx, input.tenantId, PlanPaymentKind.Upgrade))
    ) {
      throw new ApiError('conflict', 'UpgradePending', {});
    }
    const payment = await this.payments.quote(
      tx,
      {
        tenantId: input.tenantId,
        kind: priced.kind,
        planId: priced.planId,
        billingTermId: priced.billingTermId,
        amount: priced.amount,
        creditAmount: priced.creditAmount,
        recordedByPlatform: true,
      },
      now,
    );
    if (priced.ends) await this.renewals.attach(tx, payment, priced.carries, priced.ends);
    await this.payments.recordSubmission(
      tx,
      payment.id,
      {
        transactionId: input.transactionId,
        senderNumber: input.senderNumber,
        matchesQuoted: true,
        amountSent: priced.amount,
      },
      now,
    );
    await this.queue.verifyWithin(tx, payment.id, operatorId, now, ip, undefined, reusing);
    const entry = await this.store.insert(tx, {
      tenantId: input.tenantId,
      planPaymentId: payment.id,
      kind: priced.kind,
      amount: priced.amount,
      walletId: input.walletId,
      transactionId: input.transactionId,
      senderNumber: input.senderNumber,
      paidAt: input.paidAt,
      evidenceId,
      evidenceLine: input.evidenceLine ?? null,
      reason: input.reason,
      enteredBy: operatorId,
      before,
      after: await this.afterOf(tx, input.tenantId, priced.kind),
    });
    await this.audit.record(tx, {
      tenantId: input.tenantId,
      actorType: ActorType.PlatformSupport,
      actorId: null,
      action: AuditAction.ManualPaymentRecorded,
      ip,
      targetType: 'plan_payment',
      targetId: payment.id,
      result: AuditResult.Success,
      summary: {
        kind: priced.kind,
        amount: priced.amount,
        transactionId: input.transactionId,
        reason: input.reason,
      },
    });
    await this.platformAudit.recordWithin(tx, {
      actorType: PlatformActorType.Operator,
      actorId: operatorId,
      action: PlatformAuditAction.ManualEntryRecorded,
      targetType: 'tenant',
      targetId: input.tenantId,
      result: AuditResult.Success,
      ip,
      summary: {
        entryId: entry.id,
        kind: priced.kind,
        amount: priced.amount,
        transactionId: input.transactionId,
        reason: input.reason,
      },
    });
    await this.notices.send(
      tx,
      input.tenantId,
      NotificationKind.AccountNotice,
      manualEntryRecordedWords(priced.amount),
      priced.kind === PlanPaymentKind.TopUp
        ? NOTIFICATION_LINKS.balance
        : NOTIFICATION_LINKS.invoices,
    );
    return entry.id;
  }

  /** D8-48: restores what the entry changed, and D8-49: takes its invoice back with a credit note. */
  private async undoPlan(
    tx: Transaction,
    entry: SelectManualPaymentEntry,
    payment: PlanPaymentRecord,
  ): Promise<void> {
    if (!entry.before) throw new Error('a plan entry has no record of the shop before it');
    await this.renewals.undoFor(tx, payment.id);
    await this.tenants.restorePlanStanding(tx, entry.tenantId, entry.before.standing);
    const scheduled = entry.before.scheduled;
    if (scheduled) {
      await this.downgrade.restoreWithin(tx, entry.tenantId, {
        kind: scheduled.kind,
        targetPlanId: scheduled.targetPlanId,
        effectiveAt: new Date(scheduled.effectiveAt),
      });
    }
    const invoice = await this.invoices.findForPaymentWithin(tx, payment.id);
    if (!invoice) throw new Error('a plan entry has no invoice to take back');
    const amount = fromPaisa(-toPaisa(invoice.amount));
    await this.invoices.issue(
      tx,
      {
        tenantId: invoice.tenantId,
        kind: InvoiceKind.CreditNote,
        planSnapshot: invoice.planSnapshot,
        amount,
        creditAmount: '0',
        billingTermLabel: invoice.billingTermLabel,
        shopName: invoice.shopName ?? '',
        ownerName: invoice.ownerName,
        planName: invoice.planName,
        planVersion: invoice.planVersion,
        periodStart: invoice.periodStart,
        periodEnd: invoice.periodEnd,
        discountAmount: '0',
        paymentMethod: invoice.paymentMethod ?? 'wallet',
        paymentReference: invoice.paymentReference,
        planPaymentId: null,
        recordedByPlatform: true,
        reversesInvoiceId: invoice.id,
      },
      [
        {
          kind: InvoiceLineKind.Credit,
          description: `Takes back invoice #${String(invoice.number)}`,
          quantity: 1,
          amount,
        },
      ],
    );
  }

  private async tellEveryone(
    tx: Transaction,
    entry: SelectManualPaymentEntry,
    reason: string,
    operatorId: string,
    ip: string | null,
    reversalId: string,
  ): Promise<void> {
    await this.audit.record(tx, {
      tenantId: entry.tenantId,
      actorType: ActorType.PlatformSupport,
      actorId: null,
      action: AuditAction.ManualPaymentReversed,
      ip,
      targetType: 'plan_payment',
      targetId: entry.planPaymentId,
      result: AuditResult.Success,
      summary: { kind: entry.kind, amount: entry.amount, reason },
    });
    await this.platformAudit.recordWithin(tx, {
      actorType: PlatformActorType.Operator,
      actorId: operatorId,
      action: PlatformAuditAction.ManualEntryReversed,
      targetType: 'tenant',
      targetId: entry.tenantId,
      result: AuditResult.Success,
      ip,
      summary: { entryId: entry.id, reversalId, kind: entry.kind, amount: entry.amount, reason },
    });
    await this.notices.send(
      tx,
      entry.tenantId,
      NotificationKind.AccountNotice,
      manualEntryReversedWords(entry.amount, reason),
      entry.kind === PlanPaymentKind.TopUp
        ? NOTIFICATION_LINKS.balance
        : NOTIFICATION_LINKS.invoices,
    );
  }

  /** D8-51: the same pricing as the seller's own request; a top-up is what arrived. */
  private async priced(input: EntryTarget, amount: string): Promise<PricedEntry> {
    if (input.kind === ManualEntryKind.TopUp) {
      await this.topUp.assertAvailable(input.tenantId);
      return {
        kind: PlanPaymentKind.TopUp,
        planId: null,
        billingTermId: null,
        amount,
        creditAmount: '0',
        carries: [],
        ends: null,
      };
    }
    const { planId, billingTermId } = input;
    if (planId === undefined || billingTermId === undefined) {
      throw new Error('a plan entry was validated without its plan and term');
    }
    if (input.kind === ManualEntryKind.Upgrade) {
      const offer = await this.upgrade.offer(input.tenantId, planId, billingTermId);
      return {
        kind: PlanPaymentKind.Upgrade,
        planId,
        billingTermId,
        amount: offer.amount,
        creditAmount: offer.credit,
        carries: offer.extensions,
        ends: { expiresAt: offer.periodEnd, extending: true },
      };
    }
    const offer = await this.purchase.offer(input.tenantId, planId, billingTermId);
    return {
      kind: offer.kind,
      planId,
      billingTermId,
      amount: offer.amount,
      creditAmount: '0',
      carries: offer.carries,
      ends: { expiresAt: offer.endsAt, extending: false },
    };
  }

  private async assertShopOpen(tenantId: string): Promise<void> {
    const info = await this.tenants.runStandalone((tx) =>
      this.tenants.findBillingInfo(tx, tenantId),
    );
    if (!info) throw new ApiError('not_found', 'ShopNotFound', {});
    if (info.state === TenantState.Deleted) {
      throw new ApiError('conflict', 'ManualEntryShopGone', {});
    }
  }

  /** ADM-15: over 10,000 TK, or past 10 entries in a Dhaka day. */
  private async needsConfirmation(amount: string): Promise<boolean> {
    if (toPaisa(amount) > toPaisa(MANUAL_ENTRY_CONFIRM_ABOVE_TAKA.toFixed(2))) return true;
    const today = await this.store.countEntriesSince(startOfDayDhaka(this.clock()));
    return today >= MANUAL_ENTRY_DAILY_ENTRIES;
  }

  private async assertConfirmed(input: ManualEntryInput, amount: string): Promise<void> {
    if (!(await this.needsConfirmation(amount))) return;
    if (
      input.amountConfirmation === undefined ||
      toPaisa(input.amountConfirmation.toFixed(2)) !== toPaisa(amount)
    ) {
      throw new ApiError('validation_error', 'ManualEntryNeedsConfirmation', {});
    }
  }

  /**
   * ADM-15, D8-56: a transaction ID is used once, platform-wide. The one exception is an ID whose manual entry was
   * reversed: another manual entry may use it, so a payment recorded against the wrong shop can be recorded properly.
   */
  private async reusesReversedId(tx: Transaction, transactionId: string): Promise<boolean> {
    if (!(await this.payments.transactionIdUsedWithin(tx, transactionId))) return false;
    if (await this.store.hasReversedUse(tx, transactionId)) return true;
    throw new FieldsError(
      [
        {
          field: 'transactionId',
          problem: ServerFieldProblemCode.AlreadyUsed,
          messageKey: 'TransactionIdAlreadyUsed',
        },
      ],
      'conflict',
    );
  }

  /** D8-48: the shop as it stands, held until the entry commits; a top-up changes no plan, so it keeps none. */
  private async beforeOf(
    tx: Transaction,
    tenantId: string,
    kind: PlanPaymentKind,
  ): Promise<ManualEntryBefore | null> {
    const standing = await this.tenants.planStanding(tx, tenantId);
    if (!standing) throw new ApiError('not_found', 'ShopNotFound', {});
    if (kind === PlanPaymentKind.TopUp) return null;
    const scheduled = await this.downgrade.scheduledWithin(tx, tenantId);
    return {
      standing,
      scheduled: scheduled
        ? {
            kind: scheduled.kind,
            targetPlanId: scheduled.targetPlanId,
            effectiveAt: scheduled.effectiveAt.toISOString(),
          }
        : null,
    };
  }

  private async afterOf(
    tx: Transaction,
    tenantId: string,
    kind: PlanPaymentKind,
  ): Promise<ManualEntryAfter | null> {
    if (kind === PlanPaymentKind.TopUp) return null;
    const standing = await this.tenants.planStanding(tx, tenantId);
    return standing ? { planId: standing.planId, periodEnd: standing.periodEnd } : null;
  }

  private async viewOf(id: string): Promise<ManualEntryRow> {
    const row = await this.tenants.runStandalone((tx) => this.store.view(tx, id));
    if (!row) throw new Error('a manual entry just written cannot be read');
    return row;
  }
}
