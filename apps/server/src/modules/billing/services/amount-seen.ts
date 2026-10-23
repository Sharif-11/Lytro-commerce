import { ApiError } from '../../../common/api-error';
import { toPaisa } from '../../balance/services/money';

/**
 * BIL-09, UPG-07 (for every payment, decided 2026-10-23): the amount a request holds is the amount the seller was
 * shown. The server works it out again when the seller commits; a difference refuses the request with the new amount,
 * so the seller sees it before anything is charged. Nothing to check when the caller sent no amount.
 */
export function assertAmountSeen(seen: number | undefined, amount: string): void {
  if (seen === undefined || toPaisa(seen.toFixed(2)) === toPaisa(amount)) return;
  throw new ApiError('conflict', 'AmountChanged', { amount }, undefined, { amount });
}
