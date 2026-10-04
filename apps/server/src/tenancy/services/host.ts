// TEN-7a: the tenant is derived from the request host alone. This file is pure logic with no I/O,
// so the rules can be tested without a database.

// AUTH-11: lowercase a–z, 0–9 and hyphen, 3 to 30 characters, no leading or trailing hyphen.
const SLUG_PATTERN = /^[a-z0-9]([a-z0-9-]{1,28}[a-z0-9])$/;
const HOSTNAME_PATTERN =
  /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/;

export function isValidSlug(candidate: string): boolean {
  return SLUG_PATTERN.test(candidate);
}

/**
 * Lowercases the host, drops any port and a trailing dot, and returns null for anything that
 * is not a plain hostname (IPv6 literals, empty values, characters outside the hostname set).
 */
export function normalizeHost(raw: string | undefined): string | null {
  if (!raw) return null;
  const withoutPort = raw.trim().toLowerCase().replace(/:\d+$/, '');
  const withoutDot = withoutPort.endsWith('.') ? withoutPort.slice(0, -1) : withoutPort;
  return HOSTNAME_PATTERN.test(withoutDot) ? withoutDot : null;
}

export type HostTarget =
  | { kind: 'shop'; slug: string } // <slug>.<platform domain>
  | { kind: 'custom'; hostname: string } // any other host, matched against verified custom domains
  | { kind: 'platform' } // the bare platform domain: no shop
  | { kind: 'invalid' }; // missing, malformed, or a nested label such as a.b.<platform domain>

/** Decides what a request's host refers to. Performs no lookups. */
export function classifyHost(raw: string | undefined, platformDomain: string): HostTarget {
  const host = normalizeHost(raw);
  if (host === null) return { kind: 'invalid' };

  const platform = platformDomain.toLowerCase();
  if (host === platform) return { kind: 'platform' };

  const suffix = `.${platform}`;
  if (host.endsWith(suffix)) {
    const label = host.slice(0, -suffix.length);
    // Only a single label is a shop address; deeper names are not shops.
    if (label.includes('.')) return { kind: 'invalid' };
    return isValidSlug(label) ? { kind: 'shop', slug: label } : { kind: 'invalid' };
  }

  return { kind: 'custom', hostname: host };
}
