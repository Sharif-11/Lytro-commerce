import { Inject, Injectable } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { TRUSTED_EDGE_SECRET } from '../../modules/tenancy/tokens';

// R3: the shared secret Cloudflare adds to every forwarded request. Compared in constant time.
@Injectable()
export class EdgeSecret {
  constructor(@Inject(TRUSTED_EDGE_SECRET) private readonly expected: string | undefined) {}

  /** True when the edge check is off (no secret configured) or the received value equals the secret. */
  isRequired(): boolean {
    return this.expected !== undefined;
  }

  matches(received: string | string[] | undefined): boolean {
    if (this.expected === undefined) return true;
    if (typeof received !== 'string') return false;
    const a = Buffer.from(received);
    const b = Buffer.from(this.expected);
    return a.length === b.length && timingSafeEqual(a, b);
  }
}
