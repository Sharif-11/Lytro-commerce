import { CallHandler, ExecutionContext, Inject, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { map, type Observable } from 'rxjs';
import type { ApiSuccessBody } from '@lytronix/shared-types';
import { RESPONSE_MESSAGE } from '../decorators/response-message';

interface HttpResponse {
  statusCode: number;
}

// Default message per status code, when a route doesn't set its own with @ResponseMessage(). Anything not
// listed here falls back to 'Success' -- this list only needs to cover the status codes this app actually
// returns on a successful response (2xx; a 3xx redirect or anything else bypasses this interceptor's `map`
// only in the sense that no route in this app issues one today).
const DEFAULT_MESSAGE: Record<number, string> = {
  200: 'Success',
  201: 'Created',
};

/**
 * Wraps every successful response in the uniform envelope: { success: true, statusCode, message, data }.
 * Registered once, globally (APP_INTERCEPTOR) -- no controller changes its return value, since they already
 * return exactly what becomes `data`. Errors never reach this interceptor; ApiErrorFilter renders the other
 * half of the envelope.
 */
@Injectable()
export class ResponseEnvelopeInterceptor<T> implements NestInterceptor<T, ApiSuccessBody<T>> {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<ApiSuccessBody<T>> {
    const response = context.switchToHttp().getResponse<HttpResponse>();
    const override = this.reflector.getAllAndOverride<string | undefined>(RESPONSE_MESSAGE, [
      context.getHandler(),
      context.getClass(),
    ]);

    return next.handle().pipe(
      map((data) => ({
        success: true,
        statusCode: response.statusCode,
        message: override ?? DEFAULT_MESSAGE[response.statusCode] ?? 'Success',
        data,
      })),
    );
  }
}
