import { z } from 'zod';
import {
  BANK_FIELD_MAX_LENGTH,
  BANK_INSTRUCTIONS_MAX_LENGTH,
  PAYMENT_ACCOUNT_NAME_MAX_LENGTH,
  PAYMENT_ACCOUNT_NOTE_MAX_LENGTH,
  PAYMENT_ACCOUNTS_PER_METHOD_MAX,
} from '../../common/limits';
import { PAYMENT_METHOD_TYPES, type AccountMethod } from '../../common/payment-methods';
import { walletNumber } from '../../common/phone';
import { PaymentMethodKind, WalletAccountType } from '../../db/enums';
import { FieldProblemCode } from '../../validation/field-problem';

type Ctx = z.RefinementCtx;

function refuse(ctx: Ctx, path: (string | number)[], problem: FieldProblemCode, message: string) {
  ctx.addIssue({ code: 'custom', path, message, params: { problem } });
}

function text(max: number) {
  return z.string().trim().min(1).max(max);
}

// Left out or blank: none.
function optionalText(max: number) {
  return z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value ? value : undefined));
}

// WAL-01: a wallet number in its local form, the wallet's own lengths; +88 or 88 is taken off.
function walletNumberField(lengths: readonly number[]) {
  return z
    .string()
    .max(30)
    .transform((value, ctx) => {
      const local = walletNumber(value, lengths);
      if (local === null) {
        refuse(ctx, [], FieldProblemCode.InvalidFormat, 'Not a wallet number.');
        return z.NEVER;
      }
      return local;
    });
}

// An account already saved keeps its id, so a payment started on it still names it.
const accountId = z.string().uuid().optional();

function walletAccountInput(lengths: readonly number[]) {
  return z.object({
    id: accountId,
    accountName: text(PAYMENT_ACCOUNT_NAME_MAX_LENGTH),
    number: walletNumberField(lengths),
    accountType: z.nativeEnum(WalletAccountType),
    note: optionalText(PAYMENT_ACCOUNT_NOTE_MAX_LENGTH),
    active: z.boolean().optional(),
  });
}

// WAL-14: a bank account's details; the bank's name and the account number are needed.
const bankAccountInput = z.object({
  id: accountId,
  accountName: text(PAYMENT_ACCOUNT_NAME_MAX_LENGTH),
  bankName: text(BANK_FIELD_MAX_LENGTH),
  accountNumber: text(BANK_FIELD_MAX_LENGTH),
  branch: optionalText(BANK_FIELD_MAX_LENGTH),
  routingNumber: optionalText(BANK_FIELD_MAX_LENGTH),
  swiftCode: optionalText(BANK_FIELD_MAX_LENGTH),
  instructions: optionalText(BANK_INSTRUCTIONS_MAX_LENGTH),
  active: z.boolean().optional(),
});

export type WalletAccountInput = z.infer<ReturnType<typeof walletAccountInput>>;
export type BankAccountInput = z.infer<typeof bankAccountInput>;
export type PaymentAccountInput = WalletAccountInput | BankAccountInput;

/**
 * WAL-01 to WAL-05, WAL-14, WAL-15 (Phase 5 Slice 5.1): one method's accounts as the shop wants them, the whole list
 * each time, and whether the method is on. The same number or bank account twice is refused (WAL-02), as is an 11th
 * account; at most one is active, the first sent active winning (WAL-03).
 */
export function paymentMethodSchemaFor(method: AccountMethod) {
  const type = PAYMENT_METHOD_TYPES[method];
  const account: z.ZodType<PaymentAccountInput, z.ZodTypeDef, unknown> =
    type.kind === PaymentMethodKind.Bank
      ? bankAccountInput
      : walletAccountInput(type.numberLengths);
  return z
    .object({
      enabled: z.boolean(),
      accounts: z.array(account).max(PAYMENT_ACCOUNTS_PER_METHOD_MAX),
    })
    .superRefine((value, ctx) => {
      const seen = new Set<string>();
      value.accounts.forEach((row, index) => {
        const field = 'number' in row ? 'number' : 'accountNumber';
        // A number already refused (its transform failed) is not compared.
        const given: unknown = 'number' in row ? row.number : row.accountNumber;
        if (typeof given !== 'string') return;
        const key = given.toLowerCase();
        if (seen.has(key)) {
          refuse(ctx, ['accounts', index, field], FieldProblemCode.NotAllowed, 'Listed twice.');
        }
        seen.add(key);
      });
    });
}
export type PaymentMethodInput = z.infer<ReturnType<typeof paymentMethodSchemaFor>>;
