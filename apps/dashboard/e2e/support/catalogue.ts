// The plan catalogue every mocked screen reads (the prototype's own figures): Starter at ৳449 a month, Growth at ৳699
// and Pro at ৳999, each 5, 8 and 12 percent off for 3, 6 and 12 months (TRM-12), and pay-as-you-go's own limits.

export const STARTER = '00000000-0000-4000-8000-000000000001';
export const GROWTH = '00000000-0000-4000-8000-000000000002';
export const PRO = '00000000-0000-4000-8000-000000000003';
export const PAYG = '00000000-0000-4000-8000-000000000009';
export const ONE_MONTH = '00000000-0000-4000-8000-000000000101';
export const TWELVE_MONTHS = '00000000-0000-4000-8000-000000000012';

export const TERMS: [string, number][] = [
  [ONE_MONTH, 1],
  ['00000000-0000-4000-8000-000000000103', 3],
  ['00000000-0000-4000-8000-000000000106', 6],
  [TWELVE_MONTHS, 12],
];

// Each plan's price for 1, 3, 6 and 12 months.
export const PRICES: Record<string, number[]> = {
  [STARTER]: [449, 1280, 2478, 4741],
  [GROWTH]: [699, 1992, 3858, 7381],
  [PRO]: [999, 2847, 5514, 10549],
};

const LIMITS: Record<string, Record<string, number>> = {
  [STARTER]: {
    products: 100,
    orders_handled_monthly: 300,
    staff: 2,
    storage_mb: 2048,
    bandwidth_gb: 30,
  },
  [GROWTH]: {
    products: 1000,
    orders_handled_monthly: 1500,
    staff: 5,
    storage_mb: 4096,
    bandwidth_gb: 60,
  },
  [PRO]: {
    products: 5000,
    orders_handled_monthly: 6000,
    staff: 15,
    storage_mb: 8192,
    bandwidth_gb: 120,
  },
  [PAYG]: {
    products: 25,
    orders_handled_monthly: 300,
    staff: 1,
    storage_mb: 250,
    bandwidth_gb: 10,
  },
};

const NAMES: [string, string, number][] = [
  [STARTER, 'Starter', 1],
  [GROWTH, 'Growth', 2],
  [PRO, 'Pro', 3],
];

export function plans(): unknown {
  return NAMES.map(([id, name, rank]) => ({
    id,
    name,
    rank,
    description: null,
    forSale: true,
    limits: LIMITS[id],
  }));
}

export function paygPlan(): unknown {
  return {
    id: PAYG,
    name: 'Pay-as-you-go',
    rank: 0,
    description: null,
    forSale: false,
    limits: LIMITS[PAYG],
  };
}

export function terms(): unknown {
  return TERMS.map(([id, months], index) => ({
    id,
    months,
    labelBn: `${String(months)} মাস`,
    labelEn: months === 1 ? '1 month' : `${String(months)} months`,
    visible: true,
    displayOrder: index,
  }));
}

/** /me's `billingTerm` for a plan on a term. */
export function termOf(termId: string): unknown {
  const months = TERMS.find(([id]) => id === termId)?.[1] ?? 1;
  return {
    id: termId,
    labelBn: `${String(months)} মাস`,
    labelEn: months === 1 ? '1 month' : `${String(months)} months`,
    months,
  };
}

export function priceOf(planId: string, termId: string): number {
  const index = TERMS.findIndex(([id]) => id === termId);
  return PRICES[planId]?.[index] ?? 0;
}

export function prices(planId: string): unknown {
  return TERMS.map(([billingTermId]) => ({
    planId,
    billingTermId,
    price: `${String(priceOf(planId, billingTermId))}.00`,
  }));
}

export const PLAN_NAME: Record<string, string> = Object.fromEntries(
  NAMES.map(([id, name]) => [id, name]),
);

/**
 * GET /billing/prices for a shop on `ownPlan` (null on a trial or pay-as-you-go): its own plan renews, a higher one is an
 * upgrade with the credit for unused days while active, a lower one a move down; otherwise each is a purchase.
 */
export function billingPrices(
  termId: string,
  ownPlan: string | null,
  active: boolean,
  credit: number,
): unknown {
  const ownRank = NAMES.find(([id]) => id === ownPlan)?.[2] ?? 0;
  return NAMES.map(([planId, planName, rank]) => {
    const price = priceOf(planId, termId);
    const move =
      planId === ownPlan
        ? 'renewal'
        : active && rank > ownRank
          ? 'upgrade'
          : active && rank < ownRank
            ? 'downgrade'
            : 'purchase';
    const amount = move === 'upgrade' ? price - credit : move === 'downgrade' ? null : price;
    return {
      planId,
      planName,
      move,
      price: `${String(price)}.00`,
      amount: amount === null ? null : `${String(amount)}.00`,
      credit: move === 'upgrade' ? `${String(credit)}.00` : null,
      addons: [],
      blockedBy: null,
    };
  });
}
