// The owner, 2026-11-19 ("when current balance is not enough to do an action then disable the action button with a
// clear message"): what an action spends from the balance, worked out as the server does, and whether the balance
// covers it.

/** Taka as paisa, rounded half away from zero, as the server's money arithmetic does. */
function paisaOf(taka: string | number): number {
  const scaled = Number(taka) * 100;
  return Math.sign(scaled) * Math.round(Math.abs(scaled));
}

/**
 * PYG-02: an order's pay-as-you-go fee, the greater of the minimum and the percentage of its total, to the paisa (the
 * server's `orderFeePaisa`). Taka.
 */
export function orderFeeOf(grandTotal: string, minimum: string, percent: string): number {
  const min = paisaOf(minimum);
  const pctPaisa = paisaOf(grandTotal) * Number(percent);
  const pct = Math.sign(pctPaisa) * Math.round(Math.abs(pctPaisa) / 100);
  return Math.max(min, pct) / 100;
}

/** An action the balance can't cover: what it needs and what the balance holds, in taka. */
export interface BalanceShort {
  need: number;
  have: number;
}

/** Short when the action costs something and the spendable balance is less; null when it covers it or either is unknown. */
export function shortOf(need: number | null, spendable: number | null): BalanceShort | null {
  if (need === null || spendable === null || need <= 0) return null;
  return paisaOf(spendable) < paisaOf(need) ? { need, have: spendable } : null;
}
