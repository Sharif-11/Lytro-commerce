import {
  Inject,
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { UsageMetric } from '@lytronix/validators';
import { catchError, from, mergeMap, throwError, type Observable } from 'rxjs';
import { ApiError } from '../../../common/api-error';
import type { DashboardRequest } from '../../identity/guards/dashboard.guard';
import { UsageService } from '../../usage/services/usage.service';

const METRICS: ReadonlySet<unknown> = new Set(Object.values(UsageMetric));

/**
 * LIM-01: a dashboard action refused at a plan limit (a product, a seat, an upload) says what would give the shop room
 * -- the same suggestions its usage page and warnings show, in the refusal's `details.suggestions`. Only a refusal that
 * names its metric is answered; anything else, or a failure to work the suggestions out, passes through unchanged.
 */
@Injectable()
export class LimitSuggestionsInterceptor implements NestInterceptor {
  constructor(@Inject(UsageService) private readonly usage: UsageService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next
      .handle()
      .pipe(
        catchError((error: unknown) =>
          from(this.withSuggestions(context, error)).pipe(
            mergeMap((answered) => throwError(() => answered)),
          ),
        ),
      );
  }

  private async withSuggestions(context: ExecutionContext, error: unknown): Promise<unknown> {
    if (!(error instanceof ApiError) || error.code !== 'plan_limit_reached') return error;
    if (!METRICS.has(error.details['metric'])) return error;
    const tenant = context.switchToHttp().getRequest<DashboardRequest>().tenant;
    if (!tenant) return error;
    try {
      const { suggestions } = await this.usage.usage(tenant, new Date());
      return new ApiError(
        error.code,
        error.messageKey,
        { ...error.details, suggestions },
        error.retryAfterSeconds,
        error.params,
      );
    } catch {
      return error;
    }
  }
}
