import { Inject, Injectable } from '@nestjs/common';
import { isIP } from 'node:net';
import { ENV } from '../config/tokens';
import type { Env } from '../config/env';
import { EdgeSecret } from './guards/edge-secret';
import { EDGE_HEADER } from './guards/tenant.guard';
import { type HttpRequest, headerValue } from './http';

type ClientIpSettings = Pick<Env, 'CLIENT_IP_HEADER' | 'CLIENT_IP_FORMAT' | 'TRUSTED_PROXY_HOPS'>;

/** The client's real address (D14). */
@Injectable()
export class ClientIp {
  constructor(
    @Inject(EdgeSecret) private readonly edge: EdgeSecret,
    @Inject(ENV) private readonly env: ClientIpSettings,
  ) {}

  resolve(request: HttpRequest): string | null {
    if (this.edge.isRequired() && this.edge.matches(request.headers[EDGE_HEADER])) {
      const forwarded = this.fromHeader(headerValue(request.headers[this.env.CLIENT_IP_HEADER]));
      if (forwarded !== null) return forwarded;
    }
    return request.ip && isIP(request.ip) !== 0 ? request.ip : null;
  }

  private fromHeader(raw: string | undefined): string | null {
    if (raw === undefined) return null;
    if (this.env.CLIENT_IP_FORMAT === 'single') return this.validIp(raw.trim());
    const entries = raw.split(',').map((entry) => entry.trim());
    const index = entries.length - this.env.TRUSTED_PROXY_HOPS;
    if (index < 0) return null;
    return this.validIp(entries[index] ?? '');
  }

  /** The user agent and the client address, recorded with each session and sign-in failure. */
  context(request: HttpRequest): { userAgent: string | null; ip: string | null } {
    return {
      userAgent: headerValue(request.headers['user-agent']) ?? null,
      ip: this.resolve(request),
    };
  }

  private validIp(candidate: string): string | null {
    return candidate !== '' && isIP(candidate) !== 0 ? candidate : null;
  }
}
