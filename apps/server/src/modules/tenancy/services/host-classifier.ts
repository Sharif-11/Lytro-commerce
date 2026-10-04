import { Inject, Injectable } from '@nestjs/common';
import { SlugFormat } from './slug-format';
import { PLATFORM_DOMAIN } from '../tokens';

// TEN-7a: the tenant is derived from the request host alone. Pure logic with no I/O, so the rules are testable
// without a database.

const HOSTNAME_PATTERN =
  /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/;

export type HostTarget =
  | { kind: 'shop'; slug: string } // <slug>.<platform domain>
  | { kind: 'custom'; hostname: string } // any other host, matched against verified custom domains
  | { kind: 'platform' } // the bare platform domain: no shop
  | { kind: 'invalid' }; // missing, malformed, or a nested label such as a.b.<platform domain>

@Injectable()
export class HostClassifier {
  private readonly platform: string;

  constructor(
    @Inject(PLATFORM_DOMAIN) platformDomain: string,
    @Inject(SlugFormat) private readonly slugs: SlugFormat,
  ) {
    this.platform = platformDomain.toLowerCase();
  }

  /**
   * Lowercases the host, drops any port and a trailing dot, and returns null for anything that is not a plain
   * hostname (IPv6 literals, empty values, characters outside the hostname set).
   */
  normalize(raw: string | undefined): string | null {
    if (!raw) return null;
    const withoutPort = raw.trim().toLowerCase().replace(/:\d+$/, '');
    const withoutDot = withoutPort.endsWith('.') ? withoutPort.slice(0, -1) : withoutPort;
    return HOSTNAME_PATTERN.test(withoutDot) ? withoutDot : null;
  }

  /** Decides what a request's host refers to. Performs no lookups. */
  classify(raw: string | undefined): HostTarget {
    const host = this.normalize(raw);
    if (host === null) return { kind: 'invalid' };
    if (host === this.platform) return { kind: 'platform' };

    const suffix = `.${this.platform}`;
    if (host.endsWith(suffix)) {
      const label = host.slice(0, -suffix.length);
      // Only a single label is a shop address; deeper names are not shops.
      if (label.includes('.')) return { kind: 'invalid' };
      return this.slugs.isValid(label) ? { kind: 'shop', slug: label } : { kind: 'invalid' };
    }

    return { kind: 'custom', hostname: host };
  }
}
