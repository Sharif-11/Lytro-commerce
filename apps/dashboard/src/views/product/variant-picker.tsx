import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PickField } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { ChoiceList, ChoiceRow } from './choice-list';
import type { StockHolder } from './stock-holders';

/**
 * "Product · variant" (Part 18's `sh-pick-variant`; the prototype's `stock-add`): which variant a Stock card's sheet is
 * about, opening a list of them with what each holds. A product with one holder shows none.
 */
export function VariantPicker({
  product,
  holders,
  value,
  onChange,
}: {
  product: string;
  holders: readonly StockHolder[];
  value: string | null;
  onChange: (variantId: string) => void;
}): React.JSX.Element | null {
  const { t } = useTranslation('shop');
  const [open, setOpen] = useState(false);
  const chosen = holders.find((each) => each.variantId === value);
  if (holders.length < 2) return null;
  return (
    <>
      <PickField
        label={t('variantL')}
        value={chosen ? `${product} · ${chosen.name}` : ''}
        onPick={() => {
          setOpen(true);
        }}
      />
      <Sheet
        open={open}
        title={t('pickVariant')}
        onClose={() => {
          setOpen(false);
        }}
      >
        {open ? (
          <div className="flex flex-col gap-3">
            <p className="text-[14px] text-fg-muted">{product}</p>
            <ChoiceList label={t('pickVariant')}>
              {holders.map((each) => (
                <ChoiceRow
                  key={each.variantId}
                  on={each.variantId === value}
                  title={each.name}
                  sub={t('onHandN', { n: String(Number(each.onHand)) })}
                  onChoose={() => {
                    onChange(each.variantId);
                    setOpen(false);
                  }}
                />
              ))}
            </ChoiceList>
          </div>
        ) : null}
      </Sheet>
    </>
  );
}
