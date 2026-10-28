import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSetCost } from '@/api/stock';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { useErrorText } from '@/hooks/use-error-text';
import type { StockPageProduct } from '@/types/stock';
import { lineTitle, type StockLine } from './stock-lines';

/** A typed cost: taka, with paisa if any. */
const COST = /^\d+(\.\d{1,2})?$/;

/**
 * Average cost (the prototype's `sh-cost`; INV-10, D3-9): what one unit cost, typed by hand until a purchase with a cost
 * sets it -- the server says so if one has -- left empty for unknown. Never shown to customers.
 */
export function CostSheet({
  product,
  line,
  onClose,
}: {
  product: StockPageProduct | null;
  line: StockLine | null;
  onClose: () => void;
}): React.JSX.Element | null {
  if (!product || !line) return null;
  return (
    <Cost
      key={`${product.productId}:${line.variantId}`}
      product={product}
      line={line}
      onClose={onClose}
    />
  );
}

function Cost({
  product,
  line,
  onClose,
}: {
  product: StockPageProduct;
  line: StockLine;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  const errorText = useErrorText();
  const save = useSetCost(product.productId);
  // As drawn, with its thousands marked ("1,240"); the commas go again before it is sent.
  const [typed, setTyped] = useState(
    line.avgCost === null
      ? ''
      : Number(line.avgCost).toLocaleString('en-US', { maximumFractionDigits: 2 }),
  );
  const value = typed.trim().replaceAll(',', '');
  const valid = value === '' || COST.test(value);
  return (
    <Sheet
      open
      title={t('costTitle')}
      onClose={onClose}
      footer={
        <Button
          wide
          busy={save.isPending}
          disabled={!valid}
          onClick={() => {
            save.mutate(
              { variantId: line.variantId, avgCost: value === '' ? null : Number(value) },
              { onSuccess: onClose },
            );
          }}
        >
          {t('save')}
        </Button>
      }
    >
      <p className="text-[14px] text-fg-muted">{lineTitle(product, line)}</p>
      <Field
        label={t('costTitle')}
        prefix="৳"
        suffix={t('perUnit')}
        inputMode="decimal"
        value={typed}
        aria-invalid={valid ? undefined : true}
        onChange={(event) => {
          setTyped(event.target.value);
        }}
      />
      <p className="text-[14px] text-fg-muted">{t('costNote')}</p>
      {save.isError ? <Banner tone="bad">{errorText(save.error)}</Banner> : null}
    </Sheet>
  );
}
