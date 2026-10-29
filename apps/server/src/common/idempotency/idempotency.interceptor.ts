import { CallHandler, ExecutionContext, Inject, Injectable, NestInterceptor } from '@nestjs/common';
import { catchError, concatMap, of, type Observable } from 'rxjs';
import { headerValue } from '../http';
import {
  dashboardCaller,
  IdempotencyService,
  requestHashOf,
  type IdempotencyClaim,
} from './idempotency.service';

interface IdempotencyRequest {
  headers: Record<string, string | string[] | undefined>;
  path: string;
  body?: unknown;
  tenant?: { id: string } | null;
  session?: { userId: string | null };
}

interface IdempotencyResponse {
  statusCode: number;
  status(code: number): unknown;
  setHeader(name: string, value: string): unknown;
}

/**
 * API-11, D4-8: applied per-route (not globally) via `@UseInterceptors(IdempotencyInterceptor)` on the dashboard writes
 * that cost money -- purchase, top-up, upgrade and add-on confirms. The header is accepted, not required, here; order
 * creation requires it and stores its reply inside the order's own transaction instead. A key belongs to the shop and
 * the person sending it; a request that fails gives its key back, so a retry runs again.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(@Inject(IdempotencyService) private readonly idempotency: IdempotencyService) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest<IdempotencyRequest>();
    const key = headerValue(request.headers['idempotency-key']);
    const tenantId = request.tenant?.id;
    if (!key || !tenantId) return next.handle();

    const claim: IdempotencyClaim = {
      scope: { tenantId, caller: dashboardCaller(request.session?.userId ?? null) },
      key,
      path: request.path,
      requestHash: requestHashOf(request.body),
    };
    const result = await this.idempotency.begin(claim);
    const response = context.switchToHttp().getResponse<IdempotencyResponse>();

    if (result.replay) {
      response.status(result.status);
      response.setHeader('Idempotent-Replay', 'true');
      return of(result.body);
    }

    return next.handle().pipe(
      concatMap(async (body: unknown) => {
        await this.idempotency.complete(claim, response.statusCode, body);
        return body;
      }),
      catchError(async (error: unknown) => {
        await this.idempotency.release(claim);
        throw error;
      }),
    );
  }
}
