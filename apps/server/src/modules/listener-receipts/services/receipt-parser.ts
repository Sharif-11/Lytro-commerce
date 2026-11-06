import {
  bdMobileNumber,
  LISTENER_SHAPE_MAX_LENGTH,
  PaymentMethod,
  transactionIdField,
} from '@lytronix/validators';

/** LSN-06: what a wallet's SMS says, as far as Lytro could read it. */
export type ParsedMessage =
  | {
      kind: 'receipt';
      method: PaymentMethod;
      transactionId: string;
      amount: string;
      /** The number the money came from, local form; null where the receipt masks it or names none. */
      senderNumber: string | null;
    }
  /** Money that left the phone's own account: it pays nothing to the shop. */
  | { kind: 'not_money_in' }
  /** A code, an offer or anything else that is no transaction. */
  | { kind: 'not_receipt' }
  /** A transaction in wording the parser does not know. */
  | { kind: 'unknown' };

// The amount, as bKash writes it: "Tk 1,500.00".
const MONEY = String.raw`Tk\.?\s*([\d,]+(?:\.\d{1,2})?)`;
const TRANSACTION_ID = /\bTrx\s?ID[:\s]+([A-Za-z0-9]+)/i;
const TRANSACTION_IDS = new RegExp(TRANSACTION_ID.source, 'gi');
// The most an amount may be: numeric(12, 2).
const AMOUNT_MAX = 9_999_999_999.99;

// Money reaching this account, each with its amount and who it came from: a Send Money received, a merchant account's
// payment, and an agent's cash out. From the known receipts; checked against real ones before the app ships (agreed
// 2026-11-01).
const MONEY_IN: readonly RegExp[] = [
  new RegExp(
    String.raw`^You have received (?:a )?(?:payment (?:of )?)?${MONEY}\s+from\s+([^\s.]+)`,
    'i',
  ),
  new RegExp(String.raw`^Cash\s?Out (?:of )?${MONEY}\s+from\s+([^\s.]+)`, 'i'),
];

// Money leaving this account: it names who it went to, right after the amount.
const MONEY_OUT = new RegExp(
  String.raw`^(?:Send Money|Payment|Cash\s?Out|Cash\s?In|Bill Payment|Mobile Recharge|Recharge|Bank Transfer|Transfer)(?: of)?(?: ${MONEY})? to\b`,
  'i',
);

/** Whether an unread message at least looks like a transaction: a transaction ID, or an amount with a balance. */
function looksLikeTransaction(text: string): boolean {
  return TRANSACTION_ID.test(text) || (/\bTk\.?\s*\d/i.test(text) && /\bbalance\b/i.test(text));
}

/**
 * LSN-06, VER-06 (Phase 5 Slice 5.4b): reads a bKash SMS. Only money reaching this account is a receipt, so a shop's own
 * payments can never verify anything, and wording it does not know verifies nothing either (fail safe, agreed 2026-11-01).
 * Nagad's and Rocket's come with real samples and tests (LSN-06).
 */
export function parseMessage(text: string): ParsedMessage {
  const line = text.replace(/\s+/g, ' ').trim();
  // The payer writes the reference, and bKash prints it before its own TrxID: a receipt naming two different IDs could be
  // made to name any, so it is read as wording Lytro does not know, and staff check it (found at the Phase 5 close-out).
  const named = new Set(
    [...line.matchAll(TRANSACTION_IDS)].map((found) => found[1]?.toUpperCase()),
  );
  if (named.size > 1) return { kind: 'unknown' };
  const id = transactionIdField.safeParse(TRANSACTION_ID.exec(line)?.[1]);
  for (const pattern of MONEY_IN) {
    const found = pattern.exec(line);
    if (!found || !id.success) continue;
    const amount = Number((found[1] ?? '').replaceAll(',', ''));
    if (!Number.isFinite(amount) || amount <= 0 || amount > AMOUNT_MAX) continue;
    return {
      kind: 'receipt',
      method: PaymentMethod.Bkash,
      transactionId: id.data,
      amount: amount.toFixed(2),
      senderNumber: bdMobileNumber(found[2] ?? ''),
    };
  }
  if (MONEY_OUT.test(line)) return { kind: 'not_money_in' };
  return looksLikeTransaction(line) ? { kind: 'unknown' } : { kind: 'not_receipt' };
}

/**
 * VER-06 (amended 2026-11-02, Slice 5.4b read): the wording of a message the parser could not read, with who it was to or
 * from, its reference note and every number gone, so Lytro can mend the parser without keeping anyone's message:
 * "You have received Tk # from #. Fee Tk #. Balance Tk #. TrxID # at #".
 */
export function maskedShapeOf(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b(ref(?:erence)?|from|to)\b[:\s]+[^.]*/gi, '$1 #')
    .split(' ')
    .map((word) => {
      if (!/\d/.test(word) && !/^[A-Z]{6,}$/.test(word)) return word;
      return `#${/[.,;:!?]$/.test(word) ? word.slice(-1) : ''}`;
    })
    .join(' ')
    .replace(/(?:# )+#/g, '#')
    .slice(0, LISTENER_SHAPE_MAX_LENGTH);
}
