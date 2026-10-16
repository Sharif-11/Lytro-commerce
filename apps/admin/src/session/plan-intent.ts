// D2-12: a guest's plan+term choice on the marketing site, carried through the sign-up flow
// (sign-in → code/password/OAuth → create-shop) as sessionStorage rather than a search param on every
// intermediate route — sign-up has three different entry paths (code, password, OAuth) that don't all pass
// through the same screens, so a param threaded through each one's own search schema would need
// duplicating in all three; a single write-once/read-once slot survives any of them uniformly. Captured
// once at /sign-in (the one shared entry point, AUTH-12's own note), consumed once after create-shop
// succeeds.
const STORAGE_KEY = 'lytronix.tenant.plan-intent';

export interface PlanIntent {
  planId: string;
  termId: string;
}

export function setPlanIntent(intent: PlanIntent): void {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(intent));
}

export function getPlanIntent(): PlanIntent | null {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'planId' in parsed &&
      'termId' in parsed &&
      typeof parsed.planId === 'string' &&
      typeof parsed.termId === 'string'
    ) {
      return { planId: parsed.planId, termId: parsed.termId };
    }
  } catch {
    // Falls through to null, same as never having set one.
  }
  return null;
}

export function clearPlanIntent(): void {
  sessionStorage.removeItem(STORAGE_KEY);
}
