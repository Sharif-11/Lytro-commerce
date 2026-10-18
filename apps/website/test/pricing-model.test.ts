import { describe, expect, it } from 'vitest';
import type { PlanCatalogue } from '../src/lib/api/plans-api';
import { formatTaka, PricingModel } from '../src/lib/pricing/pricing-model';

const catalogue: PlanCatalogue = {
  plans: [
    {
      id: 'starter',
      name: 'Starter',
      description: null,
      rank: 1,
      forSale: true,
      limits: { products: 100 },
    },
    {
      id: 'growth',
      name: 'Growth',
      description: null,
      rank: 2,
      forSale: true,
      limits: { products: 1000 },
    },
    { id: 'unpriced', name: 'Unpriced', description: null, rank: 3, forSale: true, limits: {} },
  ],
  terms: [
    {
      id: 'year',
      labelBn: 'বার্ষিক',
      labelEn: 'Yearly',
      months: 12,
      visible: true,
      displayOrder: 2,
    },
    {
      id: 'month',
      labelBn: 'মাসিক',
      labelEn: 'Monthly',
      months: 1,
      visible: true,
      displayOrder: 1,
    },
  ],
  prices: [
    { planId: 'starter', billingTermId: 'month', price: '449.00' },
    { planId: 'starter', billingTermId: 'year', price: '4741.00' },
    { planId: 'growth', billingTermId: 'month', price: '699.00' },
  ],
};

describe('PricingModel', () => {
  it('computes the monthly equivalent and the saving against the shortest term', () => {
    const model = new PricingModel(catalogue);
    const starter = model.plans.find((plan) => plan.plan.id === 'starter');
    const yearly = starter?.terms.find((term) => term.term.id === 'year');
    expect(yearly?.monthly).toBe(395);
    expect(yearly?.savingPercent).toBe(12);
    const monthly = starter?.terms.find((term) => term.term.id === 'month');
    expect(monthly?.savingPercent).toBe(0);
  });

  it('drops a plan that has no price on any visible term', () => {
    const model = new PricingModel(catalogue);
    expect(model.plans.map((plan) => plan.plan.id)).toEqual(['starter', 'growth']);
  });

  it('keeps a plan that is priced on only one term', () => {
    const model = new PricingModel(catalogue);
    const growth = model.plans.find((plan) => plan.plan.id === 'growth');
    expect(growth?.terms.map((term) => term.term.id)).toEqual(['month']);
  });

  it('defaults to the shortest term and names the best-value term', () => {
    const model = new PricingModel(catalogue);
    expect(model.defaultTermId()).toBe('month');
    expect(model.bestValueTermId()).toBe('year');
  });
});

describe('formatTaka', () => {
  it('formats whole taka with the sign first and three-digit grouping', () => {
    expect(formatTaka(4741)).toBe('৳4,741');
    expect(formatTaka(0)).toBe('৳0');
    expect(formatTaka(395.08)).toBe('৳395');
  });
});
