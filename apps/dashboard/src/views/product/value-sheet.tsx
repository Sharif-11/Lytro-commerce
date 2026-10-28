import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AttributeDataType, AttributeRole } from '@lytronix/validators';
import { useAddOptions } from '@/api/attributes';
import { Icon } from '@/components/icon';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chips';
import { Field } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { useErrorText } from '@/hooks/use-error-text';
import { baseValueOf, MEASURE_UNITS, measureOf, type MeasureUnit } from '@/lib/measure';
import type { Description } from '@/lib/variant-matrix';
import type { Attribute } from '@/types/attribute';
import { useVariantWords } from './variant-words';

/**
 * Two or three choices side by side, one of them on (the prototype's `.seg3`). It never shrinks: in a sheet's scrolling
 * column a long list below squeezed it to a hairline, its hidden overflow letting it give up its height.
 */
export function Segments<T extends string>({
  label,
  choices,
  value,
  onChange,
}: {
  label: string;
  choices: readonly { value: T; label: string }[];
  value: T | null;
  onChange: (value: T) => void;
}): React.JSX.Element {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex flex-none overflow-hidden rounded-control border border-line-strong bg-surface"
    >
      {choices.map((choice) => (
        <button
          key={choice.value}
          type="button"
          role="radio"
          aria-checked={choice.value === value}
          className={[
            'flex-1 border-l border-line px-2 py-[11px] text-center text-[14px] first:border-l-0',
            choice.value === value
              ? 'bg-primary font-semibold text-white'
              : 'font-medium text-fg-muted',
          ].join(' ')}
          onClick={() => {
            onChange(choice.value);
          }}
        >
          {choice.label}
        </button>
      ))}
    </div>
  );
}

/** UOM-02: a number typed in a unit of its kind, kept in the base unit; changing the unit keeps the number typed. */
function NumberValue({
  description,
  readOnly,
  onChange,
}: {
  description: Description;
  readOnly: boolean;
  onChange: (number: string) => void;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  const units = description.unitKind ? MEASURE_UNITS[description.unitKind] : [];
  const stored =
    description.number === '' ? null : measureOf(description.number, description.unitKind);
  const [amount, setAmount] = useState(stored?.amount ?? '');
  const [unit, setUnit] = useState<MeasureUnit | null>(stored?.unit ?? units[0] ?? null);
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field
        label={t('valueL')}
        inputMode="decimal"
        className="num"
        readOnly={readOnly}
        value={amount}
        onChange={(event) => {
          setAmount(event.target.value);
          onChange(baseValueOf(event.target.value, unit) ?? '');
        }}
      />
      {units.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-[14px] font-medium text-fg-muted">{t('unitL')}</span>
          <Segments
            label={t('unitL')}
            value={unit}
            choices={units.map((each) => ({ value: each, label: t(`unit_${each}`) }))}
            onChange={(next) => {
              if (readOnly) return;
              setUnit(next);
              onChange(baseValueOf(amount, next) ?? '');
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

/**
 * A describing value, entered by its attribute's type (Part 14's `sh-desc-*`; ATL-02, ATR-03): text as typed, one
 * option or several, a number with its unit, yes or no. An attribute asked when ordering has no value, only what the
 * shopper fills in (`sh-asked`). Each can be removed from the product. What is typed applies as it is typed.
 */
export function ValueSheet({
  description,
  attribute,
  readOnly,
  onChange,
  onRemove,
  onClose,
}: {
  /** The description being entered; null while the sheet is shut. */
  description: Description | null;
  /** Its attribute in the library, with the options to pick from. */
  attribute: Attribute | undefined;
  readOnly: boolean;
  onChange: (patch: Partial<Description>) => void;
  onRemove: () => void;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  const words = useVariantWords();
  const errorText = useErrorText();
  const add = useAddOptions();
  const [typed, setTyped] = useState('');
  const each = description;
  const asked = each?.role === AttributeRole.CapturedAtOrder;
  const options = (attribute?.options ?? []).filter(
    (option) => !option.retired || each?.optionIds.includes(option.id),
  );

  function pick(optionId: string, value: string): void {
    if (!each) return;
    const several = each.dataType === AttributeDataType.EnumMulti;
    const on = each.optionIds.includes(optionId);
    const ids = on
      ? each.optionIds.filter((id) => id !== optionId)
      : several
        ? [...each.optionIds, optionId]
        : [optionId];
    const values = ids.map(
      (id) => options.find((option) => option.id === id)?.value ?? (id === optionId ? value : ''),
    );
    onChange({ optionIds: ids, optionValues: values });
  }

  function insert(): void {
    const value = typed.trim();
    if (!each || value === '') return;
    add.mutate(
      { attributeId: each.attributeId, values: [value] },
      {
        onSuccess: ([made]) => {
          setTyped('');
          if (made && !each.optionIds.includes(made.id)) pick(made.id, made.value);
        },
      },
    );
  }

  const body = (() => {
    if (!each || asked) return <p className="text-[14px] text-fg-muted">{t('askedLong')}</p>;
    switch (each.dataType) {
      case AttributeDataType.Text:
        return (
          <Field
            label={t('valueL')}
            value={each.text}
            readOnly={readOnly}
            help={t('shownAsTyped')}
            onChange={(event) => {
              onChange({ text: event.target.value });
            }}
          />
        );
      case AttributeDataType.Boolean:
        return (
          <div className="flex flex-col gap-1.5">
            <span className="text-[14px] font-medium text-fg-muted">{t('valueL')}</span>
            <Segments
              label={t('valueL')}
              value={each.bool === null ? null : each.bool ? 'yes' : 'no'}
              choices={[
                { value: 'yes', label: t('yes') },
                { value: 'no', label: t('no') },
              ]}
              onChange={(value) => {
                if (!readOnly) onChange({ bool: value === 'yes' });
              }}
            />
          </div>
        );
      case AttributeDataType.NumberWithUnit:
        return (
          <NumberValue
            key={each.attributeId}
            description={each}
            readOnly={readOnly}
            onChange={(number) => {
              onChange({ number });
            }}
          />
        );
      case AttributeDataType.EnumSingle:
      case AttributeDataType.EnumMulti:
        return (
          <>
            <div className="flex flex-col gap-1.5">
              <span className="text-[14px] font-medium text-fg-muted">{t('valueL')}</span>
              <div className="flex flex-wrap gap-2">
                {options.map((option) => {
                  const on = each.optionIds.includes(option.id);
                  return (
                    <Chip
                      key={option.id}
                      size="lg"
                      on={on}
                      disabled={readOnly}
                      onClick={() => {
                        pick(option.id, option.value);
                      }}
                    >
                      {on ? <Icon name="check" size={16} /> : null}
                      {option.value}
                    </Chip>
                  );
                })}
              </div>
              <p className="text-[13px] text-fg-muted">
                {each.dataType === AttributeDataType.EnumMulti ? t('pickAny') : t('pickOne')}
              </p>
            </div>
            {readOnly ? null : (
              <Field
                label={t('addOption')}
                value={typed}
                placeholder={t('optionPh')}
                error={add.isError ? errorText(add.error) : undefined}
                onChange={(event) => {
                  setTyped(event.target.value);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') insert();
                }}
                suffix={
                  <Button tone="outline" size="xs" busy={add.isPending} onClick={insert}>
                    {t('insert')}
                  </Button>
                }
              />
            )}
          </>
        );
    }
  })();

  return (
    <Sheet
      open={each !== null}
      title={each?.name ?? ''}
      onClose={onClose}
      footer={
        <Button wide onClick={onClose}>
          {t('done')}
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-[14px] text-fg-muted">
          {each
            ? t(asked ? 'askedType' : 'describesType', { type: words.type(each.dataType) })
            : null}
        </p>
        {body}
        {readOnly ? null : (
          <p className="mt-1">
            <button
              type="button"
              className="font-semibold text-danger-text underline"
              onClick={onRemove}
            >
              {t('removeFrom')}
            </button>
          </p>
        )}
      </div>
    </Sheet>
  );
}
