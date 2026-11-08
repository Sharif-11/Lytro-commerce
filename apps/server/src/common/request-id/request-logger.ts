import { ConsoleLogger, Inject, Injectable } from '@nestjs/common';
import { RequestContext } from './request-context';

/**
 * API-27 (Phase 8 Slice 8.1): the server's logger, Nest's own, with the request's ID after the context on every line
 * written while a request runs ("[ApiErrorFilter] [K7MQ-4XR2] ..."), so the line a seller's ID points to is found by
 * searching for it. Lines outside a request (start-up, a queue job) are unchanged.
 */
@Injectable()
export class RequestLogger extends ConsoleLogger {
  constructor(@Inject(RequestContext) private readonly requests: RequestContext) {
    super();
  }

  protected override formatContext(context: string): string {
    const requestId = this.requests.requestId();
    const formatted = super.formatContext(context);
    return requestId === undefined ? formatted : `${formatted}[${requestId}] `;
  }
}
