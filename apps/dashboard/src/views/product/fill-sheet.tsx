import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chips';
import { Field } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import type { FillColumn, SplitAttribute, VariantRow } from '@/lib/variant-matrix';
import { useVariantWords } from './variant-words';

/**
 * Fill all (Part 14's `sh-fill`, ATR-17): one value in every variant, or in the variants sharing one option ("all 256
 * GB"), each choice with how many it fills. Every cell stays editable after.
 */
export function FillSheet({
  column,
  splits,
  rows,
  onFill,
  onClose,
}: {
  /** The column being filled; null while the sheet is shut. */
  column: FillColumn | null;
  splits: readonly SplitAttribute[];
  rows: readonly VariantRow[];
  onFill: (column: FillColumn, value: string, optionId: string | null) => void;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  const words = useVariantWords();
  const [value, setValue] = useState('');
  const [optionId, setOptionId] = useState<string | null>(null);

  useEffect(() => {
    if (column === null) return;
    setValue('');
    setOptionId(null);
  }, [column]);

  const label = column === 'openingStock' ? t('openingStock') : t('price');
  const count = (id: string | null) =>
    id === null ? rows.length : rows.filter((row) => row.optionIds.includes(id)).length;
  const choices = [
    { id: null, label: t('fillEvery') },
    ...splits.flatMap((split) =>
      split.options.map((option) => ({ id: option.id, label: words.option(option, split) })),
    ),
  ];
  return (
    <Sheet
      open={column !== null}
      title={t('fillTitle', { column: label })}
      onClose={onClose}
      footer={
        <Button
          wide
          disabled={value.trim() === ''}
          onClick={() => {
            if (column) onFill(column, value.trim(), optionId);
          }}
        >
          {t('fillN', { count: count(optionId) })}
        </Button>
      }
    >
      {column === null ? null : (
        <div className="flex flex-col gap-3">
          <Field
            label={label}
            prefix={column === 'price' ? '৳' : undefined}
            inputMode="decimal"
            className="num"
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
            }}
          />
          <div className="flex flex-col gap-1.5">
            <span className="text-[14px] font-medium text-fg-muted">{t('fillWhich')}</span>
            <div className="flex flex-wrap gap-2">
              {choices.map((choice) => (
                <Chip
                  key={choice.id ?? 'all'}
                  size="lg"
                  on={choice.id === optionId}
                  count={count(choice.id)}
                  onClick={() => {
                    setOptionId(choice.id);
                  }}
                >
                  {choice.label}
                </Chip>
              ))}
            </div>
          </div>
          <p className="text-[13px] text-fg-muted">{t('fillNote')}</p>
        </div>
      )}
    </Sheet>
  );
}
