import { Inject, Injectable } from '@nestjs/common';
import { REQUEST_ID_HEADER } from '@lytronix/validators';
import { RequestContext } from './request-context';
import { RequestIds } from './request-ids';

/** The parts of the request and response the handler touches. Kept loose so this file does not depend on Express types. */
interface IdentifiedRequest {
  requestId?: string;
}
interface HeaderResponse {
  setHeader(name: string, value: string): unknown;
}

/**
 * API-27 (Phase 8 Slice 8.1): gives every request its ID before anything else runs: the public API's host, the body
 * parser's 413, a route, a 404. The ID goes on the response at once, so even a refusal carries it, on the request for
 * the error filter, and into the context for every log line written while it runs. One a client sends is ignored: an
 * ID is Lytro's own, never taken on a client's word.
 */
@Injectable()
export class RequestIdHandler {
  constructor(
    @Inject(RequestIds) private readonly ids: RequestIds,
    @Inject(RequestContext) private readonly context: RequestContext,
  ) {}

  readonly handle = (
    request: IdentifiedRequest,
    response: HeaderResponse,
    next: () => void,
  ): void => {
    const requestId = this.ids.next();
    request.requestId = requestId;
    response.setHeader(REQUEST_ID_HEADER, requestId);
    this.context.run(requestId, next);
  };
}
