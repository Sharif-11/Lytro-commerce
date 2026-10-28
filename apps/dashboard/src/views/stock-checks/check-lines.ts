import { useTranslation } from 'react-i18next';
import { StockTracking, type StockUnit } from '@lytronix/validators';
import { formatDayMonth } from '@/lib/dates';
import type { StockBatch, StockPageProduct } from '@/types/stock';
import { signed } from '../product/movement-words';
import { useStockLines } from '../stock/stock-lines';

/**
 * One line of a new check (INV-07, INV-12): a variant counted as a whole, or one batch of it -- a product kept in
 * batches is counted batch by batch, each batch a line under its product's name (agreed in the 11.9 read).
 */
export interface CountLine {
  /** `variantId/batchId`, as the server tells a line apart. */
  key: string;
  productId: string;
  variantId: string;
  batchId: string | null;
  /** "Denim jacket · S"; under a batch-kept product, the batch ("M · FC-0702 · 10 Oct"). */
  name: string;
  /** The product's name over its batch lines; null for a variant counted whole. */
  group: string | null;
  expected: number;
  /** INV-10: what one unit cost, for what a difference comes to; null is unknown. */
  avgCost: number | null;
  unit: StockUnit;
  /** INV-14: a serial-numbered variant counted whole, with how many of its units have no IMEI yet. */
  serial: boolean;
  missing: number;
}

/** The lines a product is counted in: each variant whole, or each of its batches; made to order, none. */
export function useCountLines(): (
  product: StockPageProduct,
  batches: readonly StockBatch[] | undefined,
) => CountLine[] {
  const { t } = useTranslation('shop');
  const linesOf = useStockLines();
  return (product, batches) => {
    if (product.stockTracking !== StockTracking.Tracked) return [];
    return linesOf(product).flatMap((line) => {
      const variant = line.name === '—' ? null : line.name;
      const whole: CountLine = {
        key: `${line.variantId}/`,
        productId: product.productId,
        variantId: line.variantId,
        batchId: null,
        name: variant ? `${product.name} · ${variant}` : product.name,
        group: null,
        expected: Number(line.onHand),
        avgCost: line.avgCost === null ? null : Number(line.avgCost),
        unit: product.stockUnit,
        serial: product.serialTracked,
        missing: line.missing,
      };
      const own = product.batchTracked
        ? (batches ?? []).filter((batch) => batch.variantId === line.variantId)
        : [];
      if (own.length === 0) return [whole];
      return own.map((batch) => ({
        ...whole,
        key: `${line.variantId}/${batch.id}`,
        batchId: batch.id,
        name: [
          variant,
          batch.batchCode,
          batch.expiresOn ? formatDayMonth(batch.expiresOn) : t('batchNoExpiry'),
        ]
          .filter(Boolean)
          .join(' · '),
        group: product.name,
        expected: Number(batch.quantity),
        serial: false,
        missing: 0,
      }));
    });
  };
}

/** INV-14: of a serial line counted short, how many units must be named -- all but those that never had an IMEI. */
export const mustName = (line: CountLine, counted: number | null): number =>
  line.serial && counted !== null && counted < line.expected
    ? Math.max(0, line.expected - counted - line.missing)
    : 0;

/** A difference as a check writes it: "+1", "−1", or "0". */
export const changeText = (change: number): string => (change === 0 ? '0' : signed(String(change)));
