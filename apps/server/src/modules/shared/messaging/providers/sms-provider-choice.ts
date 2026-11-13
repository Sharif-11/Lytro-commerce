import type { CircuitBreaker } from '../../../../common/circuit-breaker';
import type { Env } from '../../../../config/env';
import type { SmsProvider } from '../ports/sms-provider';
import { BulkSmsBdProvider, type SmsFetch } from './bulksmsbd.provider';
import { ConsoleSmsProvider } from './console-sms.provider';

export type SmsMode = 'record' | 'log' | 'send';

/**
 * D7-21 (the owner's call, 2026-11-06): every SMS costs money, so where one really goes depends on the server's mode.
 * Tests only record it. Development logs it, unless SMS_FORCE_REAL is set. Production, staging included, always sends,
 * and the settings refuse to start a production server without BulkSMSBD's login (config/env.ts).
 */
export function smsModeOf(env: Pick<Env, 'NODE_ENV' | 'SMS_FORCE_REAL'>): SmsMode {
  if (env.NODE_ENV === 'test') return 'record';
  if (env.NODE_ENV === 'production') return 'send';
  return env.SMS_FORCE_REAL ? 'send' : 'log';
}

export function smsProviderFor(
  env: Pick<
    Env,
    | 'NODE_ENV'
    | 'SMS_FORCE_REAL'
    | 'BULKSMSBD_BASE_URL'
    | 'BULKSMSBD_API_KEY'
    | 'BULKSMSBD_SENDER_ID'
  >,
  fetchSms: SmsFetch,
  breaker?: CircuitBreaker,
): SmsProvider {
  if (smsModeOf(env) !== 'send') return new ConsoleSmsProvider();
  if (!env.BULKSMSBD_API_KEY || !env.BULKSMSBD_SENDER_ID) {
    // The settings check makes this unreachable; kept so a missing login can never fall back to the stand-in quietly.
    throw new Error('BulkSMSBD login missing: set BULKSMSBD_API_KEY and BULKSMSBD_SENDER_ID');
  }
  return new BulkSmsBdProvider(
    {
      baseUrl: env.BULKSMSBD_BASE_URL,
      apiKey: env.BULKSMSBD_API_KEY,
      senderId: env.BULKSMSBD_SENDER_ID,
    },
    fetchSms,
    breaker,
  );
}
