import { z } from 'zod';
import { calendarDayField, checkPeriod } from '../../common/dates';
import { transactionIdField } from '../../common/transaction-id';
import { ManualEntryKind } from '../../db/enums';
import { FieldProblemCode } from '../../validation/field-problem';
import { evidenceKeyField } from '../billing/payment-evidence';

// ADM-14, ADM-15, D8-14, D8-47 to D8-56 (Phase 8 Slice 8.5, read agreed 2026-11-09): a payment that reached Lytro outside
// the normal flow, recorded by the operator.

const REASON_MAX = 500;

function required(ctx: z.RefinementCtx, field: string, message: string): void {
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path: [field],
    params: { problem: FieldProblemCode.Required },
    message,
  });
}

function notAllowed(ctx: z.RefinementCtx, field: string, message: string): void {
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path: [field],
    params: { problem: FieldProblemCode.NotAllowed },
    message,
  });
}

/** A plan or an upgrade names its plan and term; a top-up names neither, and states its amount. */
function checkTarget(
  value: { kind: ManualEntryKind; planId?: string; billingTermId?: string; amount?: number },
  ctx: z.RefinementCtx,
): void {
  if (value.kind === ManualEntryKind.TopUp) {
    if (value.planId !== undefined) notAllowed(ctx, 'planId', 'A top-up names no plan.');
    if (value.billingTermId !== undefined) {
      notAllowed(ctx, 'billingTermId', 'A top-up names no billing term.');
    }
    if (value.amount === undefined) required(ctx, 'amount', 'Say how much arrived.');
    return;
  }
  if (value.planId === undefined) required(ctx, 'planId', 'Choose the plan.');
  if (value.billingTermId === undefined) required(ctx, 'billingTermId', 'Choose the billing term.');
}

const targetFields = {
  tenantId: z.string().uuid(),
  kind: z.nativeEnum(ManualEntryKind),
  planId: z.string().uuid().optional(),
  billingTermId: z.string().uuid().optional(),
};

// POST /operator/manual-entries/preview: what an entry would be for this shop now, before the operator commits.
export const manualEntryPreviewSchema = z
  .object({ ...targetFields, amount: z.coerce.number().positive().max(99_999_999).optional() })
  .strict()
  .superRefine(checkTarget);
export type ManualEntryPreviewInput = z.infer<typeof manualEntryPreviewSchema>;

// POST /operator/manual-entries (ADM-14, ADM-15). `amount` is the money for a top-up and, for a plan or an upgrade, the
// amount the operator was shown: the server prices those itself and refuses a difference (D8-51).
export const manualEntrySchema = z
  .object({
    ...targetFields,
    amount: z.coerce.number().positive().max(99_999_999),
    // ADM-15: the amount typed again, over 10,000 TK or past 10 entries in a day.
    amountConfirmation: z.coerce.number().positive().optional(),
    walletId: z.string().uuid(),
    transactionId: transactionIdField,
    senderNumber: z.string().trim().min(1).max(30),
    paidAt: z.coerce.date(),
    // ADM-14: the evidence, a screenshot or a line of a statement.
    evidenceKey: evidenceKeyField.optional(),
    evidenceLine: z.string().trim().min(1).max(REASON_MAX).optional(),
    reason: z.string().trim().min(1).max(REASON_MAX),
  })
  .strict()
  .superRefine((value, ctx) => {
    checkTarget(value, ctx);
    if (value.evidenceKey === undefined && value.evidenceLine === undefined) {
      required(ctx, 'evidenceLine', 'Attach a screenshot or type the statement line.');
    }
  });
export type ManualEntryInput = z.infer<typeof manualEntrySchema>;

// POST /operator/manual-entries/:id/reverse (ADM-15): a mistake is corrected by a reversing entry, with a reason.
export const reverseManualEntrySchema = z
  .object({ reason: z.string().trim().min(1).max(REASON_MAX) })
  .strict();
export type ReverseManualEntryInput = z.infer<typeof reverseManualEntrySchema>;

// GET /operator/manual-entries (ADM-16, D8-55): every entry and reversal, newest first, by shop, operator and day.
export const manualEntryListSchema = z
  .object({
    tenantId: z.string().uuid().optional(),
    operatorId: z.string().uuid().optional(),
    dateFrom: calendarDayField.optional(),
    dateTo: calendarDayField.optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict()
  .superRefine(checkPeriod);
export type ManualEntryListQuery = z.infer<typeof manualEntryListSchema>;
