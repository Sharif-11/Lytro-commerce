import { LIMIT_KEYS } from '@/lib/limit-keys';
import type { OperatorPlan, PlanVersion } from '@/types/operator';

type Shape = Pick<PlanVersion, 'version' | 'name' | 'rank' | 'forSale' | 'limits' | 'features'>;

export type VersionChange =
  | { kind: 'limit'; key: string; from: unknown; to: unknown }
  | { kind: 'feature'; key: string; on: boolean }
  | { kind: 'name'; from: string; to: string }
  | { kind: 'rank'; from: number; to: number }
  | { kind: 'sale'; on: boolean };

export interface VersionLine {
  version: number;
  name: string;
  /** When it became the plan's version. */
  at: string;
  current: boolean;
  limits: OperatorPlan['limits'];
  /** What it changed from the version before; null on the first. */
  changes: VersionChange[] | null;
}

function changesBetween(before: Shape, after: Shape): VersionChange[] {
  const changes: VersionChange[] = [];
  if (before.name !== after.name) changes.push({ kind: 'name', from: before.name, to: after.name });
  if (before.rank !== after.rank) changes.push({ kind: 'rank', from: before.rank, to: after.rank });
  if (before.forSale !== after.forSale) changes.push({ kind: 'sale', on: after.forSale });
  for (const key of LIMIT_KEYS) {
    if (before.limits[key] !== after.limits[key]) {
      changes.push({ kind: 'limit', key, from: before.limits[key], to: after.limits[key] });
    }
  }
  const flags = new Set([...Object.keys(before.features), ...Object.keys(after.features)]);
  for (const key of flags) {
    const on = after.features[key] === true;
    if ((before.features[key] === true) !== on) changes.push({ kind: 'feature', key, on });
  }
  return changes;
}

/**
 * PLN-02: a plan's versions, newest first. A stored version records when it was replaced, so the date one began is the
 * date the version before it was recorded, and the plan's own creation for the first.
 */
export function versionLines(plan: OperatorPlan, prior: readonly PlanVersion[]): VersionLine[] {
  const oldestFirst: Shape[] = [...prior].sort((a, b) => a.version - b.version);
  oldestFirst.push(plan);
  return oldestFirst
    .map((shape, index) => {
      const before = oldestFirst[index - 1];
      return {
        version: shape.version,
        name: shape.name,
        at: prior.find((each) => each.version === shape.version - 1)?.recordedAt ?? plan.createdAt,
        current: shape.version === plan.version,
        limits: shape.limits,
        changes: before ? changesBetween(before, shape) : null,
      };
    })
    .reverse();
}

export function shopsOn(plan: OperatorPlan): number {
  return plan.shopsByVersion.reduce((sum, each) => sum + each.shops, 0);
}
