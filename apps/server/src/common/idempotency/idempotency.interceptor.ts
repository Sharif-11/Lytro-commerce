import { createHash } from 'node:crypto';
import { CallHandler, ExecutionContext, Inject, Injectable, NestInterceptor } from '@nestjs/common';
import { of, tap, type Observable } from 'rxjs';
import { headerValue } from '../http';
import { IdempotencyService } from './idempotency.service';

interface IdempotencyRequest {
  headers: Record<string, string | string[] | undefined>;
  path: string;
  body?: unknown;
}

interface IdempotencyResponse {
  statusCode: number;
  status(code: number): unknown;
  setHeader(name: string, value: string): unknown;
}

/**
 * API-11: applied per-route (not globally) via `@UseInterceptors(IdempotencyInterceptor)` on exactly the
 * writes that create something with a cost -- purchase, top-up, and later upgrade/downgrade-confirm reuse it
 * unchanged. No `Idempotency-Key` header means no idempotency behavior at all; the header is accepted, not
 * required, on these routes (only ORD-02/PAY-01, which don't exist yet, make it mandatory).
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(@Inject(IdempotencyService) private readonly idempotency: IdempotencyService) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest<IdempotencyRequest>();
    const key = headerValue(request.headers['idempotency-key']);
    if (!key) return next.handle();

    const requestHash = createHash('sha256')
      .update(JSON.stringify(request.body ?? {}))
      .digest('hex');
    const result = await this.idempotency.begin(key, request.path, requestHash);
    const response = context.switchToHttp().getResponse<IdempotencyResponse>();

    if (result.replay) {
      response.status(result.status);
      response.setHeader('Idempotent-Replay', 'true');
      return of(result.body);
    }

    return next.handle().pipe(
      tap((body: unknown) => {
        void this.idempotency.complete(key, response.statusCode, body);
      }),
    );
  }
}
