import { Inject, Injectable } from '@nestjs/common';
import { isIP } from 'node:net';
import { ENV } from '../config/tokens';
import type { Env } from '../config/env';
import { EdgeSecret } from './guards/edge-secret';
import { EDGE_HEADER } from './guards/tenant.guard';
import { type HttpRequest, headerValue } from './http';

/**
 * The client's real address. Behind the edge the socket address is the proxy's, so the forwarded address counts
 * only when the request carries the edge secret (R3). Without a valid secret the header is ignored, since any
 * client could send it. The header is set by configuration (CLIENT_IP_HEADER); for X-Forwarded-For the first
 * address in the list is the client's.
 */
@Injectable()
export class ClientIp {
  constructor(
    @Inject(EdgeSecret) private readonly edge: EdgeSecret,
    @Inject(ENV) private readonly env: Pick<Env, 'CLIENT_IP_HEADER'>,
  ) {}

  resolve(request: HttpRequest): string | null {
    if (this.edge.isRequired() && this.edge.matches(request.headers[EDGE_HEADER])) {
      const forwarded = headerValue(request.headers[this.env.CLIENT_IP_HEADER])?.split(',')[0];
      const candidate = forwarded?.trim();
      if (candidate && isIP(candidate) !== 0) return candidate;
    }
    return request.ip && isIP(request.ip) !== 0 ? request.ip : null;
  }
}
