import { useTranslation } from 'react-i18next';
import type { SerialFormat } from '@lytronix/validators';
import { useAddSerials } from '@/api/stock';
import { useErrorText } from '@/hooks/use-error-text';
import { keptOf } from '@/lib/opening';
import { OpeningSerialsSheet } from './opening-serials-sheet';
import type { StockHolder } from './stock-holders';

const NONE: ReadonlySet<string> = new Set();

/**
 * Add serials (Part 18's `sh-serials-missing`, agreed in the step-3 read; INV-14, INV-23): serials for a variant's
 * units held with none yet, entered as Part 16 enters them, up to how many have none. "Add n" saves them at once.
 */
export function MissingSerialsSheet({
  product,
  holder,
  format,
  onClose,
}: {
  product: { id: string; name: string };
  /** The variant whose units lack serials; null while closed. */
  holder: StockHolder | null;
  format: SerialFormat;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  const errorText = useErrorText();
  const add = useAddSerials(product.id);
  const name =
    holder && holder.name !== product.name ? `${product.name} · ${holder.name}` : product.name;
  const missing = holder?.missing ?? 0;
  return (
    <OpeningSerialsSheet
      open={holder !== null}
      name={name}
      units={missing}
      format={format}
      lines={[]}
      others={NONE}
      entry={{
        title: t('addSerials'),
        sub: `${name} · ${t('serialsMissing', { n: missing })}`,
        none: t('serialsNoneMissing'),
        full: t('serialsAllNamed'),
        done: (kept) => t('addN', { n: kept }),
      }}
      busy={add.isPending}
      error={add.isError ? errorText(add.error) : null}
      onDone={(lines) => {
        const serials = keptOf(lines);
        if (!holder || serials.length === 0) {
          onClose();
          return;
        }
        add.mutate({ variantId: holder.variantId, serials }, { onSuccess: onClose });
      }}
      onClose={onClose}
    />
  );
}
