import { PLAN_FEATURES } from '@lytronix/validators';
import type { OperatorPlan } from '@/types/operator';

/**
 * PLN-02 (the owner, 2026-11-24): the flags a plan's editor lists, each with whether it is on -- the plan's own first,
 * then every other flag the platform reads or a plan carries, off. Only the plan's own flags and those the operator
 * flips are sent, so a flag left alone is never stored.
 */
export function flagsShown(
  features: Readonly<Record<string, boolean>>,
  allPlans: readonly Pick<OperatorPlan, 'features'>[],
): [key: string, on: boolean][] {
  const keys = new Set([
    ...Object.keys(features),
    ...PLAN_FEATURES,
    ...allPlans.flatMap((each) => Object.keys(each.features)),
  ]);
  return [...keys].map((key) => [key, features[key] === true]);
}
