import { describe, expect, it } from 'vitest';
import type { OperatorPlan } from '../src/types/operator';
import { suggestionSwitch } from '../src/views/plans/suggestion';

function plan(id: string, values: Partial<OperatorPlan> = {}): OperatorPlan {
  return {
    id,
    name: id,
    description: null,
    rank: 1,
    forSale: true,
    version: 1,
    limits: {},
    features: {},
    suggested: false,
    createdAt: '2026-11-13T00:00:00.000Z',
    shopsByVersion: [],
    deletable: false,
    trial: false,
    onPricingPage: true,
    ...values,
  };
}

describe('the suggested-plan switch (PLN-21)', () => {
  const starter = plan('Starter', { suggested: true });
  const growth = plan('Growth');

  it('is not there for the Trial', () => {
    const trial = plan('Trial', { trial: true, forSale: false, onPricingPage: false });
    expect(suggestionSwitch(trial, [trial, starter], false)).toEqual({ shown: false });
  });

  it('says the mark moves from the plan that has it', () => {
    expect(suggestionSwitch(growth, [starter, growth], false)).toEqual({
      shown: true,
      enabled: true,
      note: { key: 'plans.suggestedMove', name: 'Starter' },
    });
  });

  it('says what turning it on does when no plan is marked', () => {
    expect(suggestionSwitch(growth, [growth], false)).toEqual({
      shown: true,
      enabled: true,
      note: { key: 'plans.suggestedNone' },
    });
  });

  it('says the landing page highlights the plan while it is on', () => {
    expect(suggestionSwitch(starter, [starter, growth], true)).toEqual({
      shown: true,
      enabled: true,
      note: { key: 'plans.suggestedOn' },
    });
  });

  it('is greyed, with the reason, on a plan the pricing page does not show', () => {
    const retired = plan('Legacy', { forSale: false, onPricingPage: false });
    expect(suggestionSwitch(retired, [starter, retired], false)).toEqual({
      shown: true,
      enabled: false,
      note: { key: 'plans.suggestedOff' },
    });
  });

  it('can still take off a mark a plan off the pricing page carries', () => {
    const retired = plan('Legacy', { forSale: false, onPricingPage: false, suggested: true });
    expect(suggestionSwitch(retired, [retired], true)).toMatchObject({
      shown: true,
      enabled: true,
    });
  });

  it('Pay-as-you-go is not for sale, yet on the pricing page, so it can be marked', () => {
    const payg = plan('Pay-as-you-go', { forSale: false, onPricingPage: true });
    expect(suggestionSwitch(payg, [starter, payg], false)).toMatchObject({ enabled: true });
  });
});
