import { planLimitsSchema, type PlanLimits } from '@lytronix/validators';

export type LimitKey = keyof PlanLimits;

/** Every limit a plan can carry, in the validator's own order: the one list the plan editor, the override
    form and the limit labels all read (PLN-02, D3). */
export const LIMIT_KEYS = Object.keys(planLimitsSchema.shape) as LimitKey[];

/** PLN-19: every limit except the retention period can be set to unlimited (null). */
export function canBeUnlimited(key: LimitKey): boolean {
  return key !== 'activity_retention_days';
}

/** The dictionary key for a limit's label: `limits.<key>`. */
export function limitLabelKey(key: string): string {
  return `limits.${key}`;
}
