import { describe, expect, it } from 'vitest';
import {
  ACTIVITY_GROUPS,
  activityRetentionDays,
  AuditAction,
  AuditResult,
  listActivitySchema,
} from '../src';

// AUD-04, AUD-06: the Activity page's chips are groups of the log's own actions, sent as one list; its retention line
// reads the shop's own figure, or the table's when none is set.
describe("the Activity page's filters", () => {
  it('puts each action in one chip at most, every one an action the log writes', () => {
    const grouped: AuditAction[] = Object.values(ACTIVITY_GROUPS).flat();
    expect(new Set(grouped).size).toBe(grouped.length);
    const known = new Set<string>(Object.values(AuditAction));
    expect(grouped.every((action) => known.has(action))).toBe(true);
  });

  it('reads one action or several, comma-separated, and refuses one the log does not write', () => {
    expect(listActivitySchema.parse({ action: 'sign_in' }).action).toEqual([AuditAction.SignIn]);
    expect(listActivitySchema.parse({ action: ACTIVITY_GROUPS.signIns.join(',') }).action).toEqual([
      ...ACTIVITY_GROUPS.signIns,
    ]);
    expect(listActivitySchema.safeParse({ action: 'sign_in,not_an_action' }).success).toBe(false);
    expect(listActivitySchema.parse({ result: 'failure' }).result).toBe(AuditResult.Failure);
  });

  it("gives the shop's retention, or 30 days when its limits set none", () => {
    expect(activityRetentionDays({ activity_retention_days: 90 })).toBe(90);
    expect(activityRetentionDays({})).toBe(30);
    expect(activityRetentionDays(null)).toBe(30);
  });
});
