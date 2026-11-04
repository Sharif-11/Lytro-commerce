import { PaymentMethod } from '@lytronix/validators';
import type { PageAsk } from './screens';
import type { PageLanguage } from './words';

/** PAY-22: Bangla unless English was asked for. */
export function languageOf(value: unknown): PageLanguage {
  return value === 'en' ? 'en' : 'bn';
}

/** A method named in an address or a form, if it is one. */
export function methodOf(value: unknown): PaymentMethod | null {
  return Object.values(PaymentMethod).find((method) => method === value) ?? null;
}

/** What a page's address asks of it. Anything it doesn't know is ignored. */
export function askOf(query: Readonly<Record<string, unknown>>): PageAsk {
  return {
    language: languageOf(query['lang']),
    wallet: methodOf(query['w']),
    pick: query['pick'] === '1',
    hand: query['hand'] === '1',
    change: query['change'] === '1',
    just: query['just'] === '1',
    reported: query['reported'] === '1',
  };
}

/** The page's own address, in the language being used, with what is asked of it. */
export function pageAddress(
  ref: string,
  language: PageLanguage,
  query: Readonly<Record<string, string>> = {},
): string {
  const parts = new URLSearchParams(query);
  if (language === 'en') parts.set('lang', 'en');
  const text = parts.toString();
  return `/${ref}${text === '' ? '' : `?${text}`}`;
}

/** PAY-23: the page's Content Security Policy: its own origin only, and the media address for the shop's logo. */
export function pageHeaders(mediaOrigin: string | undefined): Record<string, string> {
  const policy = [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
    "font-src 'self'",
    `img-src 'self'${mediaOrigin ? ` ${mediaOrigin}` : ''}`,
    "connect-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "object-src 'none'",
  ].join('; ');
  return {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Security-Policy': policy,
    // The address is what opens the page, so no other site is told it.
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  };
}
