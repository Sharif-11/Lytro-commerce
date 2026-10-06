import { Inject, Injectable, Optional } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { TRUSTED_EDGE_SECRET, TRUSTED_EDGE_SECRET_NEXT } from '../../modules/tenancy/tokens';

// R3: the shared secret the edge adds to every forwarded request.
@Injectable()
export class EdgeSecret {
  constructor(
    @Inject(TRUSTED_EDGE_SECRET) private readonly expected: string | undefined,
    @Optional()
    @Inject(TRUSTED_EDGE_SECRET_NEXT)
    private readonly next?: string,
  ) {}

  /** True when the edge check is on (a secret is configured). */
  isRequired(): boolean {
    return this.expected !== undefined;
  }

  matches(received: string | string[] | undefined): boolean {
    if (!this.isRequired()) return true;
    if (typeof received !== 'string') return false;
    return [this.expected, this.next].some(
      (secret) => secret !== undefined && this.sameSecret(received, secret),
    );
  }

  private sameSecret(received: string, secret: string): boolean {
    const a = Buffer.from(received);
    const b = Buffer.from(secret);
    return a.length === b.length && timingSafeEqual(a, b);
  }
}
