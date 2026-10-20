import { FieldProblemCode } from '@lytronix/validators';
import { FieldsError } from '../../../common/api-error';
import { dhakaDate } from '../../../common/time';
import type { BatchDescription, StockChange, StockVariantRow } from '../types/inventory';

/**
 * INV-12: the batch a stock change names or describes, from a request's `batch` and `batchId` (a field path `prefix`
 * names where they sit, as `items.0`). Only a batch-tracked product has batches, and only arriving stock opens one,
 * never with an expiry already past; stock leaving may name the batch it leaves.
 */
export function batchChoiceOf(
  variant: Pick<StockVariantRow, 'product'>,
  input: { batch?: BatchDescription; batchId?: string },
  rising: boolean,
  prefix = '',
): Pick<StockChange, 'batch' | 'batchId'> {
  if (input.batch === undefined && input.batchId === undefined) return {};
  const at = prefix === '' ? '' : `${prefix}.`;
  const field = `${at}${input.batchId !== undefined ? 'batchId' : 'batch'}`;
  if (!variant.product.batchTracked) {
    throw new FieldsError([
      { field, problem: FieldProblemCode.NotAllowed, messageKey: 'BatchesNotTracked' },
    ]);
  }
  if (input.batchId !== undefined) return { batchId: input.batchId };
  if (!rising) {
    throw new FieldsError([
      { field, problem: FieldProblemCode.NotAllowed, messageKey: 'NewBatchOnlyForArrivals' },
    ]);
  }
  const expiresOn = input.batch?.expiresOn;
  if (expiresOn !== undefined && expiresOn < dhakaDate(new Date())) {
    throw new FieldsError([
      {
        field: `${at}batch.expiresOn`,
        problem: FieldProblemCode.NotAllowed,
        messageKey: 'ExpiryInThePast',
      },
    ]);
  }
  return { batch: input.batch ?? null };
}
