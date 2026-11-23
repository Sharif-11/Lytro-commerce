import { PAYG_API_BLOCK, PAYG_API_CAP_WARN_PERCENT } from '@lytronix/validators';

/**
 * PYG-26 (PAYG-FAIR-USE-PLAN PF-14, PF-36, PF-37): a pay-as-you-go shop's own website's API use in one cycle, and what
 * pays for it -- in paisa, so no figure is rounded twice.
 */
export interface ChargeFigures {
  /** The cycle's successful answers so far. */
  billable: number;
  /** The whole 1,000s already charged this cycle. */
  billedBlocks: number;
  /** The free successful answers each cycle. */
  free: number;
  /** The price of 1,000, and the seller's cap for the cycle. */
  ratePaisa: bigint;
  capPaisa: bigint;
  /** What the balance can spend now. */
  balancePaisa: bigint;
}

/** Charge warnings, furthest first: the free allowance used, four fifths of the cap, stopped. */
export const CHARGE_WARNED = { none: 0, freeUsed: 1, nearCap: 2, stopped: 3 } as const;

/** The whole 1,000s the cap allows in a cycle; null with a rate of nothing, which charges nothing and stops nothing. */
function capBlocks(figures: ChargeFigures): number | null {
  if (figures.ratePaisa === 0n) return null;
  return Number(figures.capPaisa / figures.ratePaisa);
}

/** The requests past the free allowance. */
function paidRequests(billable: number, free: number): number {
  return Math.max(0, billable - free);
}

/**
 * PF-14: whether the next request may be answered. Free until the allowance is used; past it, only while the requests
 * stay within the cap's whole 1,000s and the balance covers the 1,000s not yet charged, so nothing is ever owed past
 * the cap or the balance.
 */
export function admitsNext(figures: ChargeFigures): boolean {
  const paid = paidRequests(figures.billable + 1, figures.free);
  if (paid === 0) return true;
  const cap = capBlocks(figures);
  if (cap === null) return true;
  if (paid > cap * PAYG_API_BLOCK) return false;
  const owed = Math.ceil(paid / PAYG_API_BLOCK) - figures.billedBlocks;
  return BigInt(Math.max(0, owed)) * figures.ratePaisa <= figures.balancePaisa;
}

/**
 * PF-14: the whole 1,000s to charge now -- those past the free allowance not charged yet, never past the cap and never
 * more than the balance can pay. A part-1,000 waits for the next charge.
 */
export function dueBlocks(figures: ChargeFigures): number {
  const whole = Math.floor(paidRequests(figures.billable, figures.free) / PAYG_API_BLOCK);
  const cap = capBlocks(figures);
  if (cap === null) return 0;
  const due = Math.min(whole, cap) - figures.billedBlocks;
  if (due <= 0) return 0;
  return Math.min(due, Number(figures.balancePaisa / figures.ratePaisa));
}

/** PF-36: the furthest warning these figures call for. */
export function chargeWarning(figures: ChargeFigures, chargedPaisa: bigint): number {
  if (!admitsNext(figures)) return CHARGE_WARNED.stopped;
  if (
    figures.capPaisa > 0n &&
    chargedPaisa * 100n >= figures.capPaisa * BigInt(PAYG_API_CAP_WARN_PERCENT)
  ) {
    return CHARGE_WARNED.nearCap;
  }
  if (figures.billable >= figures.free) return CHARGE_WARNED.freeUsed;
  return CHARGE_WARNED.none;
}
