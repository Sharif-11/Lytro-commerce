import { describe, expect, it } from 'vitest';
import { PaymentMethod } from '@lytronix/validators';
import {
  maskedShapeOf,
  parseMessage,
} from '../src/modules/listener-receipts/services/receipt-parser';

// LSN-06, VER-06 (Phase 5 Slice 5.4b, read agreed 2026-11-02): bKash's receipts as they are known, to be checked against
// real ones before the app ships (Slice 5.5). Only money reaching the account is a receipt.
describe('reading a bKash SMS (LSN-06)', () => {
  it('reads a Send Money received', () => {
    expect(
      parseMessage(
        'You have received Tk 1,500.50 from 01811000002. Fee Tk 0.00. Balance Tk 9,500.75. TrxID 9AB1CD2EFG at 02/11/2026 13:58',
      ),
    ).toEqual({
      kind: 'receipt',
      method: PaymentMethod.Bkash,
      transactionId: '9AB1CD2EFG',
      amount: '1500.50',
      senderNumber: '01811000002',
    });
  });

  it('reads one with a reference note, its lines broken, and no paisa', () => {
    expect(
      parseMessage(
        'You have received Tk 500 from 01811000002.\nRef for the saree.\nFee Tk 0.00. Balance Tk 700.00.\nTrxID 7ht3b9xw2c at 02/11/2026 13:58',
      ),
    ).toMatchObject({ kind: 'receipt', amount: '500.00', transactionId: '7HT3B9XW2C' });
  });

  it("reads a merchant account's payment and an agent's cash out", () => {
    expect(
      parseMessage(
        'You have received payment Tk 300.00 from 01811000002. Fee Tk 5.55. Balance Tk 294.45. TrxID 8KD2LM4NPQ at 02/11/2026 14:00',
      ),
    ).toMatchObject({ kind: 'receipt', amount: '300.00', senderNumber: '01811000002' });
    expect(
      parseMessage(
        'Cash Out Tk 700.00 from 01811000002 successful. Fee Tk 0.00. Balance Tk 12,000.00. TrxID 6QW9ER3TYU at 02/11/2026 14:05',
      ),
    ).toMatchObject({ kind: 'receipt', amount: '700.00', transactionId: '6QW9ER3TYU' });
  });

  it('leaves the sender out where the receipt masks it or names none', () => {
    expect(
      parseMessage(
        'You have received Tk 300.00 from 018XXXXXX02. Fee Tk 0.00. Balance Tk 300.00. TrxID 5ZX8CV2BNM at 02/11/2026 14:10',
      ),
    ).toMatchObject({ kind: 'receipt', senderNumber: null });
  });

  it('never takes money leaving the account for a receipt', () => {
    for (const text of [
      'Send Money Tk 500.00 to 01811000002 successful. Fee Tk 5.00. Balance Tk 100.00. TrxID 4AS7DF1GHJ at 02/11/2026 15:00',
      'Payment Tk 200.00 to Rahim Store successful. Balance Tk 100.00. TrxID 3LK6JH9GFD at 02/11/2026 15:01',
      'Cash Out Tk 700.00 to 01811000002 successful. Fee Tk 12.95. Balance Tk 100.00. TrxID 2PO5IU8YTR at 02/11/2026 15:02',
      'Cash In Tk 700.00 to 01811000002 successful. Balance Tk 100.00. TrxID 1MN4BV7CXZ at 02/11/2026 15:03',
    ]) {
      expect(parseMessage(text)).toEqual({ kind: 'not_money_in' });
    }
  });

  it('takes codes and offers for no transaction at all', () => {
    for (const text of [
      'Your bKash verification code is 482910. It expires in 2 minutes.',
      'Get Tk 50 cashback on your next Mobile Recharge!',
    ]) {
      expect(parseMessage(text)).toEqual({ kind: 'not_receipt' });
    }
  });

  it('fails safe on wording it does not know, and on an impossible ID or amount', () => {
    for (const text of [
      'Tk 500.00 has reached your account from 01811000002. Balance Tk 700.00. TrxID 9AB1CD2EFG at 02/11/2026 13:58',
      'Money received: Tk 500.00. New balance Tk 700.00.',
      'You have received Tk 500.00 from 01811000002. Balance Tk 700.00. TrxID ABC at 02/11/2026 13:58',
      'You have received Tk 0.00 from 01811000002. Balance Tk 700.00. TrxID 9AB1CD2EFG at 02/11/2026 13:58',
      'You have received Tk 99999999999.00 from 01811000002. Balance Tk 700.00. TrxID 9AB1CD2EFG at 02/11/2026 13:58',
    ]) {
      expect(parseMessage(text), text).toEqual({ kind: 'unknown' });
    }
  });
});

describe("an unreadable message's shape (VER-06, amended 2026-11-02)", () => {
  it('keeps the wording, and no number, ID, person or note', () => {
    const shape = maskedShapeOf(
      'Tk 500.00 has reached your account from Karim Uddin 01811000002. Ref for my sister Rina. Balance Tk 1,700.50. TrxID 9AB1CD2EFG at 02/11/2026 13:58',
    );
    expect(shape).toBe('Tk # has reached your account from #. Ref #. Balance Tk #. TrxID # at #');
  });

  it('removes an ID in capitals with no digits, and keeps within its length', () => {
    expect(maskedShapeOf('Your TrxID ABCDEFGHIJ was taken')).toBe('Your TrxID # was taken');
    expect(maskedShapeOf('word '.repeat(200)).length).toBeLessThanOrEqual(300);
  });
});
