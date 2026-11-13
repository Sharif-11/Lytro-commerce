import { performance } from 'node:perf_hooks';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { REQUEST_ID_HEADER, redactText } from '@lytronix/shared-types';
import { RequestContext, type RequestState } from './request-context';
import { RequestIds } from './request-ids';
import { RequestLogger } from './request-logger';

/** The parts of the request and response the handler touches. Kept loose so this file does not depend on Express types. */
interface IdentifiedRequest {
  requestId?: string;
  method?: string;
  originalUrl?: string;
  url?: string;
  /** Set by Express once a route matched: its pattern. */
  route?: { path?: unknown };
  tenant?: { id: string } | null;
  apiShop?: { row: { id: string } };
}
interface HeaderResponse {
  setHeader(name: string, value: string): unknown;
  statusCode?: number;
  once?(event: 'finish', listener: () => void): unknown;
}

/**
 * API-27 (Phase 8 Slice 8.1): gives every request its ID before anything else runs: the public API's host, the body
 * parser's 413, a route, a 404. The ID goes on the response at once, so even a refusal carries it, on the request for
 * the error filter, and into the context for every log line written while it runs. One a client sends is ignored: an
 * ID is Lytro's own, never taken on a client's word.
 *
 * PRF-04 (Slice 9.6): when the response is sent, its request line: the route, status, time, and the time spent on
 * outside services (Slice 9.5), so a slow request's own share is its time less that. Not for the health checks, which
 * Caddy and the uptime checks make every few seconds.
 */
@Injectable()
export class RequestIdHandler {
  constructor(
    @Inject(RequestIds) private readonly ids: RequestIds,
    @Inject(RequestContext) private readonly context: RequestContext,
    @Optional() @Inject(RequestLogger) private readonly logger?: Pick<RequestLogger, 'request'>,
  ) {}

  readonly handle = (
    request: IdentifiedRequest,
    response: HeaderResponse,
    next: () => void,
  ): void => {
    const requestId = this.ids.next();
    request.requestId = requestId;
    response.setHeader(REQUEST_ID_HEADER, requestId);
    const started = performance.now();
    this.context.run(requestId, () => {
      const state = this.context.current();
      if (state && this.logger) {
        response.once?.('finish', () => {
          this.finished(request, response, state, started);
        });
      }
      next();
    });
  };

  private finished(
    request: IdentifiedRequest,
    response: HeaderResponse,
    state: Readonly<RequestState>,
    started: number,
  ): void {
    const path = (request.originalUrl ?? request.url ?? '').split('?')[0] ?? '';
    if (path.startsWith('/health')) return;
    const pattern = request.route?.path;
    this.logger?.request({
      requestId: state.requestId,
      shopId: state.shopId ?? request.tenant?.id ?? request.apiShop?.row.id,
      method: request.method ?? 'GET',
      route: typeof pattern === 'string' ? pattern : redactText(path),
      status: response.statusCode ?? 0,
      ms: Math.round(performance.now() - started),
      outsideMs: state.outsideMs,
      outsideCalls: state.outsideCalls,
    });
  }
}
