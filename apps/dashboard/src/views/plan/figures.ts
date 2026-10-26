import type { PlanLimits } from '@lytronix/validators';
import { limitFigure, type LimitKey } from '@/lib/limits';
import type { BillingTerm, OverLimitItem } from '@/types/billing';
import type { LapseStages } from '@/types/me';

/** LIF-04: the day, counted from the period's end, each step of a lapse begins on. */
export interface LapseDays {
  grace: number;
  viewOnly: number;
  locked: number;
  deleted: number;
}

export function lapseDays(stages: LapseStages): LapseDays {
  const locked = stages.grace + stages.readOnly;
  return {
    grace: stages.grace,
    viewOnly: stages.grace,
    locked,
    deleted: locked + stages.locked + stages.archived,
  };
}

/** One limit as it moves from one plan to another: "products 100 → 1,000". */
export interface LimitMove {
  key: LimitKey;
  from: string;
  to: string;
}

// The limits an upgrade names, in the sketch's order (`limitsChange`), and the ones pay-as-you-go lowers (`pgLimits`).
export const UPGRADE_LIMITS: readonly LimitKey[] = ['products', 'staff', 'orders_handled_monthly'];
export const PAYG_LIMITS: readonly LimitKey[] = ['products', 'staff', 'storage_mb', 'bandwidth_gb'];

/** The limits among `keys` the two plans set differently. */
export function limitMoves(
  keys: readonly LimitKey[],
  from: PlanLimits,
  to: PlanLimits,
): LimitMove[] {
  return keys.flatMap((key) => {
    const before = limitFigure(key, from[key]);
    const after = limitFigure(key, to[key]);
    if (before === null || after === null || before === after) return [];
    return [{ key, from: before, to: after }];
  });
}

// What a downgrade can leave the shop over (DWN-03), in the order the sketch lists them.
const OVER_ORDER: readonly string[] = ['products', 'storage_mb', 'staff'];

/** A move down's over-limit items, products first, each with its figures as the sheet writes them. */
export function overLimits(items: readonly OverLimitItem[]): (OverLimitItem & {
  usedText: string;
  limitText: string;
})[] {
  const rank = (key: string): number => {
    const at = OVER_ORDER.indexOf(key);
    return at === -1 ? OVER_ORDER.length : at;
  };
  return [...items]
    .sort((a, b) => rank(a.key) - rank(b.key))
    .map((item) => ({
      ...item,
      usedText: figureOf(item.key, item.used),
      limitText: figureOf(item.key, item.limit),
    }));
}

function figureOf(key: string, value: number): string {
  return key === 'storage_mb' || key === 'bandwidth_gb'
    ? (limitFigure(key, value) ?? String(value))
    : value.toLocaleString('en-US');
}

/** A term's own words in the visitor's language: "1 month", "1 মাস". */
export function termLabel(
  term: Pick<BillingTerm, 'labelBn' | 'labelEn'>,
  language: string,
): string {
  return language === 'bn' ? term.labelBn : term.labelEn;
}
