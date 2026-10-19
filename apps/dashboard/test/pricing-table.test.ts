import { describe, expect, it } from 'vitest';
import { PricingTable } from '../src/lib/pricing-table';
import type { BillingTerm, Plan, PlanPrice } from '../src/types/billing';

const plans: Plan[] = [
  { id: 'starter', name: 'Starter', description: null, rank: 1, forSale: true, limits: {} },
  { id: 'hidden', name: 'Hidden', description: null, rank: 2, forSale: false, limits: {} },
];
const terms: BillingTerm[] = [
  { id: 'year', labelBn: 'বার্ষিক', labelEn: 'Yearly', months: 12, visible: true, displayOrder: 2 },
  { id: 'month', labelBn: 'মাসিক', labelEn: 'Monthly', months: 1, visible: true, displayOrder: 1 },
  { id: 'secret', labelBn: 'গোপন', labelEn: 'Secret', months: 3, visible: false, displayOrder: 3 },
];
const prices: PlanPrice[] = [
  { planId: 'starter', billingTermId: 'month', price: '449.00' },
  { planId: 'starter', billingTermId: 'year', price: '4741.00' },
  { planId: 'starter', billingTermId: 'secret', price: '1.00' },
  { planId: 'hidden', billingTermId: 'month', price: '1.00' },
];

describe('PricingTable', () => {
  const table = new PricingTable(plans, terms, prices);

  it('lists only for-sale plans and visible terms, in display order', () => {
    expect(table.plans().map((plan) => plan.id)).toEqual(['starter']);
    expect(table.termsFor('starter').map((term) => term.id)).toEqual(['month', 'year']);
  });

  it('computes the monthly equivalent and the saving against the shortest term', () => {
    const yearly = table.option('starter', 'year');
    expect(yearly?.monthly).toBe(395);
    expect(yearly?.savingPercent).toBe(12);
    expect(table.option('starter', 'month')?.savingPercent).toBe(0);
  });

  it('defaults a plan to its shortest term', () => {
    expect(table.defaultOption('starter')?.term.id).toBe('month');
  });

  it('is empty without any priced for-sale plan', () => {
    expect(new PricingTable([], terms, prices).isEmpty()).toBe(true);
  });
});
