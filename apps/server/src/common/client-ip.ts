import { Inject, Injectable } from '@nestjs/common';
import { isIP } from 'node:net';
import { EdgeSecret } from './guards/edge-secret';
import { EDGE_HEADER } from './guards/tenant.guard';
import { type HttpRequest, headerValue } from './http';

export const CLIENT_IP_HEADER = 'cf-connecting-ip';

/**
 * The client's real address. Behind Cloudflare the socket address is the edge's, so the forwarded address counts
 * only when the request carries the edge secret (R3). Without a valid secret the header is ignored, since any
 * client could send it.
 */
@Injectable()
export class ClientIp {
  constructor(@Inject(EdgeSecret) private readonly edge: EdgeSecret) {}

  resolve(request: HttpRequest): string | null {
    if (this.edge.isRequired() && this.edge.matches(request.headers[EDGE_HEADER])) {
      const forwarded = headerValue(request.headers[CLIENT_IP_HEADER])?.trim();
      if (forwarded && isIP(forwarded) !== 0) return forwarded;
    }
    return request.ip && isIP(request.ip) !== 0 ? request.ip : null;
  }
}
