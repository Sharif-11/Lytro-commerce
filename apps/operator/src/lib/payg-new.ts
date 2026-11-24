import { PaygFairUseMode, PlatformSettingKey, RateKey } from '@lytronix/validators';
import type { PlatformSetting } from '@/types/operator';

const DAY_MS = 24 * 60 * 60 * 1000;
const FAIR_USE_KEY: string = PlatformSettingKey.PaygFairUse;
const FAIR_USE_ON: string = PaygFairUseMode.On;
/** How long the fair-use rows stay marked new once the switch is on. */
export const PAYG_NEW_DAYS = 30;

/** PAYG-FAIR-USE-PLAN PF-39 (the sketch's `pf-console`): the rates fair use brings, each marked "New". */
export const PAYG_NEW_RATES: ReadonlySet<RateKey> = new Set([
  RateKey.PaygUnlockPhone,
  RateKey.PaygUnlockConfirm,
  RateKey.PaygBookingFee,
  RateKey.PaygApiPerThousand,
]);

/** The settings the sketch marks "New": the activation top-up and the switch itself. */
export const PAYG_NEW_SETTINGS: ReadonlySet<string> = new Set([
  PlatformSettingKey.PaygActivationTopUp,
  PlatformSettingKey.PaygFairUse,
]);

/**
 * Whether the fair-use rows still read "New": while the switch is off, and for 30 days after it is turned on (the
 * switch's own last change says when). Nothing is marked until the settings have loaded.
 */
export function paygStillNew(
  settings: readonly PlatformSetting[] | undefined,
  now: number = Date.now(),
): boolean {
  const fairUse = settings?.find((each) => each.key === FAIR_USE_KEY);
  if (!fairUse) return false;
  if (fairUse.value !== FAIR_USE_ON) return true;
  return now - Date.parse(fairUse.updatedAt) < PAYG_NEW_DAYS * DAY_MS;
}
