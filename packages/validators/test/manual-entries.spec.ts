import { describe, expect, it } from 'vitest';
import {
  fieldProblemsOf,
  FieldProblemCode,
  ManualEntryKind,
  manualEntrySchema,
} from '../src/index';

// ADM-14, D8-75 (Phase 8 Slice 8.8): a manual entry names one of Lytro's numbers, with a TrxID and the sender, or one of
// its bank accounts, with the transfer's reference in the TrxID's place and no sender.
const WALLET = '6f1c2a10-1d2e-4b3c-8a9b-0c1d2e3f4a5b';
const BANK = '7a2d3b21-2e3f-4c4d-9b0c-1d2e3f4a5b6c';

const TOP_UP = {
  tenantId: '5e0b1f09-0c1d-4a2b-9f8e-7d6c5b4a3f2e',
  kind: ManualEntryKind.TopUp,
  amount: 2000,
  paidAt: '2026-11-10T10:00:00+06:00',
  evidenceLine: '10-11-2026 BEFTN CR 2,000.00',
  reason: 'Paid while the page was down',
};

function problemsOf(value: unknown): Record<string, string> {
  const result = manualEntrySchema.safeParse(value);
  if (result.success) return {};
  return Object.fromEntries(
    fieldProblemsOf(result.error).map((entry) => [entry.field, entry.problem]),
  );
}

describe('a manual entry paid to one of Lytro numbers', () => {
  it('takes a TrxID and the sender, kept in capitals', () => {
    const parsed = manualEntrySchema.parse({
      ...TOP_UP,
      walletId: WALLET,
      transactionId: 'bkj7rx2m9q',
      senderNumber: '01712345678',
    });
    expect(parsed.transactionId).toBe('BKJ7RX2M9Q');
    expect(parsed.bankAccountId).toBeUndefined();
  });

  it('needs the sender', () => {
    expect(problemsOf({ ...TOP_UP, walletId: WALLET, transactionId: 'BKJ7RX2M9Q' })).toEqual({
      senderNumber: FieldProblemCode.Required,
    });
  });

  it('refuses a TrxID with a bank reference shape', () => {
    expect(
      problemsOf({
        ...TOP_UP,
        walletId: WALLET,
        transactionId: 'BRAC-FT-55190327',
        senderNumber: '01712345678',
      }),
    ).toEqual({ transactionId: FieldProblemCode.InvalidFormat });
  });
});

describe('a manual entry paid to one of Lytro bank accounts', () => {
  it("takes the transfer's reference as the statement shows it, and no sender", () => {
    const parsed = manualEntrySchema.parse({
      ...TOP_UP,
      bankAccountId: BANK,
      transactionId: ' brac-ft-55190327 ',
    });
    expect(parsed.transactionId).toBe('BRAC-FT-55190327');
    expect(parsed.walletId).toBeUndefined();
    expect(parsed.senderNumber).toBeUndefined();
  });

  it('refuses a sender', () => {
    expect(
      problemsOf({
        ...TOP_UP,
        bankAccountId: BANK,
        transactionId: 'BRAC-FT-55190327',
        senderNumber: '01712345678',
      }),
    ).toEqual({ senderNumber: FieldProblemCode.NotAllowed });
  });

  it('refuses a reference too short to be used once platform-wide, or with other marks', () => {
    expect(problemsOf({ ...TOP_UP, bankAccountId: BANK, transactionId: 'AB1' })).toEqual({
      transactionId: FieldProblemCode.InvalidFormat,
    });
    expect(problemsOf({ ...TOP_UP, bankAccountId: BANK, transactionId: 'REF#5519' })).toEqual({
      transactionId: FieldProblemCode.InvalidFormat,
    });
  });
});

describe('where the money arrived', () => {
  it('is one of the two, not both', () => {
    expect(
      problemsOf({
        ...TOP_UP,
        walletId: WALLET,
        bankAccountId: BANK,
        transactionId: 'BKJ7RX2M9Q',
        senderNumber: '01712345678',
      }),
    ).toEqual({ bankAccountId: FieldProblemCode.NotAllowed });
  });

  it('is required', () => {
    expect(
      problemsOf({ ...TOP_UP, transactionId: 'BKJ7RX2M9Q', senderNumber: '01712345678' }),
    ).toEqual({ walletId: FieldProblemCode.Required });
  });
});
