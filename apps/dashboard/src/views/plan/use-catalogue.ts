import { useMemo, useState } from 'react';
import { useBillingPrices, useBillingTerms, usePlanPrices, usePlans } from '@/api/billing';
import { PricingTable } from '@/lib/pricing-table';
import type { BillingTerm, Plan, PlanPriceOption } from '@/types/billing';

export interface PlanCatalogue {
  /** The terms on offer, in their order. */
  terms: BillingTerm[];
  term: BillingTerm | null;
  pickTerm: (termId: string) => void;
  /** What each plan would cost the shop now on the term (GET /billing/prices), in rank order. */
  options: PlanPriceOption[];
  planOf: (planId: string) => Plan | undefined;
  /** The public price table, for the term chips' savings. */
  table: PricingTable;
  loading: boolean;
  error: unknown;
}

/**
 * The plans as the plan screens offer them: the term chips (opening on the shop's own term, TRM-12) and each plan's
 * figures on the chosen term, read without making a payment (BIL-09).
 */
export function usePlanCatalogue(ownTermId: string | null): PlanCatalogue {
  const plans = usePlans();
  const termList = useBillingTerms();
  const publicPrices = usePlanPrices(
    (plans.data ?? []).filter((plan) => plan.forSale).map((plan) => plan.id),
  );
  const terms = useMemo(
    () =>
      (termList.data ?? [])
        .filter((term) => term.visible)
        .sort((a, b) => a.displayOrder - b.displayOrder),
    [termList.data],
  );
  const [picked, setPicked] = useState<string | null>(null);
  const term =
    terms.find((each) => each.id === picked) ??
    terms.find((each) => each.id === ownTermId) ??
    terms[0] ??
    null;
  const prices = useBillingPrices(term?.id ?? null);
  const table = useMemo(
    () => new PricingTable(plans.data ?? [], termList.data ?? [], publicPrices.prices),
    [plans.data, termList.data, publicPrices.prices],
  );
  return {
    terms,
    term,
    pickTerm: setPicked,
    options: prices.data ?? [],
    planOf: (planId) => plans.data?.find((plan) => plan.id === planId),
    table,
    loading: plans.isLoading || termList.isLoading || prices.isLoading,
    error: plans.error ?? termList.error ?? prices.error,
  };
}
