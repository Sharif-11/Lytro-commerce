import { Inject, Injectable } from '@nestjs/common';
import { isIP } from 'node:net';
import { ENV } from '../config/tokens';
import type { Env } from '../config/env';
import { EdgeSecret } from './guards/edge-secret';
import { EDGE_HEADER } from './guards/tenant.guard';
import { type HttpRequest, headerValue } from './http';

type ClientIpSettings = Pick<Env, 'CLIENT_IP_HEADER' | 'CLIENT_IP_FORMAT' | 'TRUSTED_PROXY_HOPS'>;

/**
 * The client's real address (D14). Behind the edge the socket address is the proxy's, so the forwarded address
 * counts only when the request carries the edge secret. Without a valid secret the header is ignored, since any
 * client could send it.
 *
 * A list header (X-Forwarded-For) is a chain that each trusted proxy appends to. The client is the entry the
 * nearest trusted proxy added, which is TRUSTED_PROXY_HOPS places from the end. Entries before it were sent by the
 * client and are not trusted.
 */
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
    if (this.env.CLIENT_IP_FORMAT === 'single') return validIp(raw.trim());
    const entries = raw.split(',').map((entry) => entry.trim());
    const index = entries.length - this.env.TRUSTED_PROXY_HOPS;
    if (index < 0) return null;
    return validIp(entries[index] ?? '');
  }
}

function validIp(candidate: string): string | null {
  return candidate !== '' && isIP(candidate) !== 0 ? candidate : null;
}
