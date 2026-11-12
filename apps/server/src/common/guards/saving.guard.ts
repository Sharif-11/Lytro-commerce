import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { PrimaryWatch } from '../../database/primary-watch';
import { ApiError } from '../api-error';

/** The methods that never write; everything else may, and waits while the database can't save. */
const READS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** How long a refused write is told to wait: the watch looks again within 30 seconds (DAT-44). */
export const SAVING_RETRY_AFTER_SECONDS = 30;

/**
 * DAT-42, DAT-47 (Slice 9.2, D9-14): while the write pool can't reach the primary, a request that may write is refused
 * with 503 and a retry hint, in the owner's words ("Because of a problem, changes won't be saved for a few minutes"),
 * and nothing is applied anywhere else. Reads go on. A write retried with the same idempotency key after recovery is
 * applied once. The banner the dashboard and storefront show for it is Slice 9.9's.
 */
@Injectable()
export class SavingGuard implements CanActivate {
  constructor(@Inject(PrimaryWatch) private readonly watch: Pick<PrimaryWatch, 'canSave'>) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;
    const { method } = context.switchToHttp().getRequest<{ method: string }>();
    if (READS.has(method.toUpperCase()) || this.watch.canSave()) return true;
    throw new ApiError('service_unavailable', 'SavingPaused', {}, SAVING_RETRY_AFTER_SECONDS);
  }
}
