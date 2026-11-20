import type { Env } from '../../config/env';

/** How much one client address may ask for: SUP-08's accounts an hour, SMS-11's code SMS an hour, AUTH-09's trials. */
export interface AddressLimits {
  signupsPerHour: number;
  codeSmsPerHour: number;
  /** Free-trial shops, over TRIAL_LIMIT_WINDOW_DAYS (90). */
  trialsPerWindow: number;
}

/** The SRS's values: production's until the dashboard checks for bots, and a request's while Cloudflare can't say. */
export const STRICT_ADDRESS_LIMITS: AddressLimits = {
  signupsPerHour: 10,
  codeSmsPerHour: 20,
  trialsPerWindow: 1,
};

/**
 * SUP-08, SMS-11, AUTH-09 as amended 2026-11-20 (the owner's "Raise them + bot check", before the Facebook campaign):
 * Bangladesh's mobile networks show many phones as one address, so the strict values turn real sellers away. They are
 * raised only while each code SMS needs a Turnstile token Cloudflare passes (TURNSTILE_SECRET_KEY), which is what stops
 * a script now. A phone's own limits (AUTH-07) and one trial per identity are unchanged.
 */
export const RAISED_ADDRESS_LIMITS: AddressLimits = {
  signupsPerHour: 200,
  codeSmsPerHour: 200,
  trialsPerWindow: 1000,
};

/** Development, CI and the e2e suites ask from one loopback address many times a run. */
const DEVELOPMENT_ADDRESS_LIMITS: AddressLimits = {
  signupsPerHour: 1000,
  codeSmsPerHour: 1000,
  trialsPerWindow: 1000,
};

/** The defaults the settings fall back to (SIGNUP_RATE_LIMIT_PER_IP and the others still win when set). */
export function addressLimitsOf(
  env: Pick<Env, 'NODE_ENV' | 'TURNSTILE_SECRET_KEY'>,
): AddressLimits {
  if (env.NODE_ENV !== 'production') return DEVELOPMENT_ADDRESS_LIMITS;
  return env.TURNSTILE_SECRET_KEY === undefined ? STRICT_ADDRESS_LIMITS : RAISED_ADDRESS_LIMITS;
}
