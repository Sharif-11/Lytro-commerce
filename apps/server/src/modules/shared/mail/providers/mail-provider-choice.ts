import type { Env } from '../../../../config/env';
import type { MailProvider } from '../ports/mail-provider';
import { ConsoleMailProvider } from './console-mail.provider';
import { ResendMailProvider, type MailFetch } from './resend-mail.provider';

export type MailMode = 'record' | 'log' | 'send';

/**
 * D7-22 (the owner's call, 2026-11-06), as D7-21 is for SMS: email reaches real people, so where one really goes depends
 * on the server's mode. Tests only record it. Development prints it, unless EMAIL_FORCE_REAL is set. Production, staging
 * included, always sends, and the settings refuse to start a production server without Resend's key (config/env.ts).
 */
export function mailModeOf(env: Pick<Env, 'NODE_ENV' | 'EMAIL_FORCE_REAL'>): MailMode {
  if (env.NODE_ENV === 'test') return 'record';
  if (env.NODE_ENV === 'production') return 'send';
  return env.EMAIL_FORCE_REAL ? 'send' : 'log';
}

/** The provider for the server's mode: the stand-in, or Resend. */
export function mailProviderFor(
  env: Pick<
    Env,
    'NODE_ENV' | 'EMAIL_FORCE_REAL' | 'RESEND_BASE_URL' | 'RESEND_API_KEY' | 'MAIL_FROM'
  >,
  fetchMail: MailFetch,
): MailProvider {
  if (mailModeOf(env) !== 'send') return new ConsoleMailProvider();
  if (!env.RESEND_API_KEY) {
    // The settings check makes this unreachable; kept so a missing key can never fall back to the stand-in quietly.
    throw new Error('Resend key missing: set RESEND_API_KEY');
  }
  return new ResendMailProvider(
    { baseUrl: env.RESEND_BASE_URL, apiKey: env.RESEND_API_KEY, from: env.MAIL_FROM },
    fetchMail,
  );
}
