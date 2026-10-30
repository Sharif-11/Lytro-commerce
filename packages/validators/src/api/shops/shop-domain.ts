import { z } from 'zod';

// TEN-09 to TEN-14 (Slice 13, its read agreed 2026-10-30): a Growth or Pro shop's own domain. What a seller types is
// cleaned to a bare hostname; a name like www.megh.com is verified by one CNAME to the shop's own address, a root
// domain by the A record to the platform's address and a TXT record naming the shop; the address's twin (megh.com and
// www.megh.com) is optional and leads to the address added.

/** How often a waiting domain is checked, how long it may wait, and how often an active one is checked again. */
export const DOMAIN_CHECK_MINUTES = 10;
export const DOMAIN_VERIFY_HOURS = 72;
export const DOMAIN_RECHECK_HOURS = 24;
/** An active domain whose record is missing on this many checks running falls back to waiting. */
export const DOMAIN_MISSES_TO_FALL_BACK = 2;
/** The TXT record's name under a root domain, and its value naming the shop. */
export const DOMAIN_TXT_LABEL = '_lytro';
export function domainTxtValue(slug: string): string {
  return `lytro=${slug}`;
}

const HOSTNAME_MAX_LENGTH = 253;
const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;
const TOP_LABEL = /^[a-z]{2,63}$/;

/**
 * A typed domain as the bare hostname it names -- lower case, without a scheme, a path, a port or a trailing dot --
 * or null when it is not a domain (an address, one label, a stray character). Bangla and other non-ASCII names are
 * typed in their `xn--` form.
 */
export function normalizeDomain(typed: string): string | null {
  const host = typed
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
    .replace(/[/?#].*$/, '')
    .replace(/:\d+$/, '')
    .replace(/\.$/, '');
  if (host.length === 0 || host.length > HOSTNAME_MAX_LENGTH) return null;
  const labels = host.split('.');
  if (labels.length < 2) return null;
  const top = labels.at(-1) ?? '';
  if (!TOP_LABEL.test(top) && !top.startsWith('xn--')) return null;
  return labels.every((label) => LABEL.test(label)) ? host : null;
}

/** The address's twin: www.megh.com for megh.com (or megh.com.bd) and the other way round. Which name is a root cannot
    be told from its labels (megh.com.bd is one), so every name but a www one is offered its www twin. */
export function domainTwinOf(host: string): string {
  return host.startsWith('www.') ? host.slice(4) : `www.${host}`;
}

/** Whether the page shows the CNAME (a www name, never a root) or the A and TXT records, which suit any name. Either
    way is accepted when the domain is checked. */
export function domainUsesCname(host: string): boolean {
  return host.startsWith('www.');
}

// The second-level names countries share out, under which a domain bought has three labels (megh.com.bd, megh.co.uk).
const SHARED_SECOND_LEVELS = new Set(['ac', 'co', 'com', 'edu', 'gov', 'info', 'net', 'org']);

/**
 * A record's name as the domain's seller asks for it: relative to the domain bought -- `@` for that domain itself,
 * `www` for www.megh.com, `_lytro` for _lytro.megh.com. The domain bought is the name's last two labels, or three
 * under a country's shared second level.
 */
export function domainRecordName(name: string): string {
  const labels = name.split('.');
  const [second = '', top = ''] = labels.slice(-2);
  const bought = labels.length > 2 && top.length === 2 && SHARED_SECOND_LEVELS.has(second) ? 3 : 2;
  const below = labels.slice(0, -bought);
  return below.length === 0 ? '@' : below.join('.');
}

// POST /api/v1/domain: the address the seller bought.
export const addDomainSchema = z.object({
  hostname: z.string().trim().min(1).max(HOSTNAME_MAX_LENGTH),
});
export type AddDomainInput = z.infer<typeof addDomainSchema>;
