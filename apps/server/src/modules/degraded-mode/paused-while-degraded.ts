import {
  Inject,
  Injectable,
  SetMetadata,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Observable } from 'rxjs';
import { ApiError } from '../../common/api-error';
import { DegradedMode } from './services/degraded-mode';

const PAUSED_WHILE_DEGRADED = 'pausedWhileDegraded';

// How soon to ask again: a few minutes, since degraded mode lasts as long as the trouble does.
const PAUSED_RETRY_SECONDS = 300;

/**
 * DAT-38 (Slice 9.5): a heavy route -- an export, a report, reading an order from a message -- refused while degraded
 * mode is on, with "paused for a while"; everything else runs.
 */
export const PausedWhileDegraded = (): MethodDecorator & ClassDecorator =>
  SetMetadata(PAUSED_WHILE_DEGRADED, true);

/**
 * DAT-38 (Slice 9.5): refuses a PausedWhileDegraded route, 503 with a retry hint, while degraded mode is on. An
 * interceptor, so it runs after the route's own guards: a caller not allowed in hears that first.
 */
@Injectable()
export class PausedWhileDegradedInterceptor implements NestInterceptor {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(DegradedMode) private readonly degraded: DegradedMode,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const paused = this.reflector.getAllAndOverride<boolean | undefined>(PAUSED_WHILE_DEGRADED, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (paused === true && (await this.degraded.on())) {
      throw new ApiError('service_unavailable', 'PausedForLoad', {}, PAUSED_RETRY_SECONDS);
    }
    return next.handle();
  }
}
