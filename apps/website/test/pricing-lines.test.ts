import { describe, expect, it } from 'vitest';
import { PricingViewBuilder } from '../src/components/landing/pricing';
import type { PlanCatalogue } from '../src/lib/api/plans-api';
import { Copy } from '../src/lib/i18n/copy';
import type { AppUrls } from '../src/lib/urls';

// SFT-17: the storefront is on every plan at no extra cost, so every paid card says so, whatever else it lists.
const plan = (id: string, rank: number, limits: Record<string, number | null>) => ({
  id,
  name: id,
  description: null,
  rank,
  forSale: true,
  limits,
});
const catalogue = {
  plans: [
    plan('Starter', 1, { products: 100 }),
    plan('Growth', 2, { products: 1000 }),
    plan('Pro', 3, {}),
  ],
  terms: [
    {
      id: 'month',
      labelBn: 'মাসিক',
      labelEn: 'Monthly',
      months: 1,
      visible: true,
      displayOrder: 1,
    },
  ],
  prices: ['Starter', 'Growth', 'Pro'].map((planId) => ({
    planId,
    billingTermId: 'month',
    price: '449.00',
  })),
} as unknown as PlanCatalogue;
const urls = { signIn: () => '#' } as unknown as AppUrls;

describe('the plan cards (SFT-17)', () => {
  it.each([
    ['en', 'Your own storefront included'],
    ['bn', 'নিজের স্টোরফ্রন্ট সহ'],
  ] as const)('lists the storefront first on every paid card, in %s', (language, line) => {
    const view = new PricingViewBuilder(new Copy(language), urls).build(catalogue);
    expect(view?.plans.map((card) => card.name)).toEqual(['Starter', 'Growth', 'Pro']);
    for (const card of view?.plans ?? []) expect(card.lines[0]).toBe(line);
  });
});
