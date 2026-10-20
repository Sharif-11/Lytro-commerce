import { Inject, Injectable } from '@nestjs/common';
import { EdgeSecret } from '../../../common/guards/edge-secret';
import { EDGE_HEADER } from '../../../common/guards/tenant.guard';
import { headerValue, type HttpRequest, type HttpResponse } from '../../../common/http';
import { HostClassifier } from '../../tenancy/services/host-classifier';
import { ApiKeyAuthenticator } from './api-key-authenticator';
import { allowPreflight } from './cors';

// API-14: the public API's own paths, versioned by their first segment.
const PUBLIC_PATH = /^\/v1(\/|\?|$)/;

/** The parts of an Express request and response this middleware reads and writes. */
interface RawRequest extends HttpRequest {
  method: string;
  url: string;
  /** Set when the request came in on the API host at its public /v1/ address. */
  publicApi?: boolean;
}
interface RawResponse extends HttpResponse {
  statusCode: number;
  end(): unknown;
}

/**
 * API-14, API-23: the public API host, `api.<platform domain>`. Its /v1/... paths are served by the same routes the
 * platform's own hosts reach at /api/v1/..., marked as having come in that way (so the public routes answer there
 * only); and a preflight is answered here, before any route, since it carries no key: it is allowed when its
 * website is registered on a live public key.
 */
@Injectable()
export class PublicApiHost {
  constructor(
    @Inject(HostClassifier) private readonly hosts: HostClassifier,
    @Inject(ApiKeyAuthenticator) private readonly authenticator: ApiKeyAuthenticator,
    @Inject(EdgeSecret) private readonly edge: EdgeSecret,
  ) {}

  /** As Express middleware, ahead of every route. */
  readonly handle = (
    request: RawRequest,
    response: RawResponse,
    next: (error?: unknown) => void,
  ): void => {
    this.route(request, response, next).catch(next);
  };

  private async route(
    request: RawRequest,
    response: RawResponse,
    next: (error?: unknown) => void,
  ): Promise<void> {
    if (this.hosts.classify(headerValue(request.headers.host)).kind !== 'api') {
      next();
      return;
    }
    if (PUBLIC_PATH.test(request.url)) {
      request.url = `/api${request.url}`;
      request.publicApi = true;
    }
    if (request.method !== 'OPTIONS') {
      next();
      return;
    }
    const origin = headerValue(request.headers.origin);
    const throughEdge = !this.edge.isRequired() || this.edge.matches(request.headers[EDGE_HEADER]);
    if (
      !throughEdge ||
      request.publicApi !== true ||
      origin === undefined ||
      !(await this.authenticator.isRegistered(origin))
    ) {
      response.statusCode = 403;
      response.end();
      return;
    }
    allowPreflight(response, origin);
    response.statusCode = 204;
    response.end();
  }
}
