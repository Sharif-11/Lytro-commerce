/** Fixes · UI/UX batch 2, item 4.1: the quick amounts, those inside the platform's live bounds shown. */
export const QUICK_TOP_UPS: readonly number[] = [10, 20, 50, 100];
const OPENS_ON = 50;

/** The quick amounts a top-up offers inside its bounds (item 4.1). */
export function quickTopUps(bounds: { min: number; max: number }): number[] {
  return QUICK_TOP_UPS.filter((each) => each >= bounds.min && each <= bounds.max);
}

/**
 * The amount the sheet opens on: ৳50, or the amount a prompt names (PAYG-FAIR-USE-PLAN PF-41: the activation's ৳10),
 * moved inside the bounds when they leave it out.
 */
export function openingTopUp(bounds: { min: number; max: number }, opensOn = OPENS_ON): number {
  return Math.min(Math.max(opensOn, bounds.min), bounds.max);
}

/** Whether a typed amount is outside the bounds, so the field says which amounts are allowed (item 4.4). */
export function outsideTopUp(value: number, bounds: { min: number; max: number }): boolean {
  return value < bounds.min || value > bounds.max;
}
