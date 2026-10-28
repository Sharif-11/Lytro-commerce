import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AttributeDataType, OPTION_SET_NAME_MAX_LENGTH } from '@lytronix/validators';
import { useAddOptions, useSaveOptionSet, useUpdateOption } from '@/api/attributes';
import { Icon } from '@/components/icon';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chips';
import { Field } from '@/components/ui/field';
import { Eyebrow } from '@/components/ui/page';
import { Sheet } from '@/components/ui/sheet';
import { useErrorText } from '@/hooks/use-error-text';
import { baseValueOf, MEASURE_UNITS, type MeasureUnit } from '@/lib/measure';
import { setsFor, type SplitAttribute } from '@/lib/variant-matrix';
import type { Attribute, OptionSet } from '@/types/attribute';
import type { OptionSwatch, UsedOption } from '@/types/product';
import { SwatchDot, SwatchPalette, type SwatchChoice } from './swatch-palette';
import { Segments } from './value-sheet';
import { useVariantWords } from './variant-words';

/**
 * A splitting attribute's options (§7.4's "Options and swatches", Part 14's `sh-options` and `sh-options-colour`;
 * ATR-16, ATR-18): option sets inserted in one tap, the options with a swatch each, an option typed in (a number in its
 * unit), "Save as a set", and taking the attribute off the product. A swatch belongs to the option, so it is saved at
 * once, for every product that uses it: tapping a shop's own option's circle opens its palette under it -- six colours,
 * Other colour, From a photo, None; a library colour stays as it is. Options join and leave the product as they are
 * tapped; the product keeps them once saved.
 */
export function OptionsSheet({
  split,
  attribute,
  optionSets,
  onInsert,
  onRemoveOption,
  onSwatch,
  onRemoveAttribute,
  onClose,
}: {
  /** The attribute whose options are open; null while the sheet is shut. */
  split: SplitAttribute | null;
  /** Its attribute in the library, for which options are the shop's own. */
  attribute: Attribute | undefined;
  optionSets: readonly OptionSet[];
  onInsert: (options: UsedOption[]) => void;
  onRemoveOption: (option: UsedOption) => void;
  onSwatch: (optionId: string, swatch: OptionSwatch) => void;
  onRemoveAttribute: () => void;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  const words = useVariantWords();
  const errorText = useErrorText();
  const add = useAddOptions();
  const setSwatch = useUpdateOption();
  const saveSet = useSaveOptionSet();
  const [typed, setTyped] = useState('');
  const [unit, setUnit] = useState<MeasureUnit | null>(null);
  const [painting, setPainting] = useState<string | null>(null);
  const [naming, setNaming] = useState(false);
  const [setName, setSetName] = useState('');
  const [savedSet, setSavedSet] = useState<string | null>(null);

  const attributeId = split?.attributeId ?? null;
  useEffect(() => {
    if (attributeId === null) return;
    setTyped('');
    setUnit(null);
    setPainting(null);
    setNaming(false);
    setSavedSet(null);
    add.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attributeId]);

  const units = split?.unitKind ? MEASURE_UNITS[split.unitKind] : [];
  const chosenUnit = unit ?? units[0] ?? null;
  const number = split?.dataType === AttributeDataType.NumberWithUnit;
  const scopeOf = (optionId: string) =>
    attribute?.options.find((each) => each.id === optionId)?.scope ?? 'shop';
  const painted = split?.options.find((each) => each.id === painting) ?? null;

  function insert(values: string[]): void {
    if (!split || values.length === 0) return;
    add.mutate(
      { attributeId: split.attributeId, values },
      {
        onSuccess: (made) => {
          setTyped('');
          onInsert(
            made
              .filter((each) => !split.options.some((option) => option.id === each.id))
              .map((each) => ({
                id: each.id,
                value: each.value,
                swatchColor: each.swatchColor,
                swatchImage: each.swatchImage,
              })),
          );
        },
      },
    );
  }

  function typedValue(): string | null {
    const value = typed.trim();
    if (value === '') return null;
    return number ? baseValueOf(value, chosenUnit) : value;
  }

  function paint(choice: SwatchChoice): void {
    if (!split || !painted) return;
    setSwatch.mutate(
      {
        attributeId: split.attributeId,
        optionId: painted.id,
        body:
          'swatchImageId' in choice
            ? { swatchImageId: choice.swatchImageId }
            : { swatchColor: choice.swatchColor },
      },
      {
        onSuccess: (saved) => {
          onSwatch(saved.id, { swatchColor: saved.swatchColor, swatchImage: saved.swatchImage });
        },
      },
    );
  }

  const values = split?.options.map((option) => option.value) ?? [];
  const offered = setsFor(split?.options ?? [], optionSets);
  return (
    <Sheet
      open={split !== null}
      title={split ? t('optionsTitle', { name: split.name }) : ''}
      onClose={onClose}
      footer={
        <Button wide onClick={onClose}>
          {t('done')}
        </Button>
      }
    >
      {split ? (
        <div className="flex flex-col gap-3">
          {offered.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <Eyebrow>
                {t('optionSets')} · {t('insert')}
              </Eyebrow>
              <div className="flex flex-wrap gap-2">
                {offered.map((each) => (
                  <Chip
                    key={each.id}
                    size="lg"
                    disabled={add.isPending}
                    onClick={() => {
                      insert(each.options);
                    }}
                  >
                    {each.name}
                  </Chip>
                ))}
              </div>
            </div>
          ) : null}
          {split.options.length > 0 ? (
            <div className="flex-none overflow-hidden rounded-card border border-line">
              {split.options.map((option) => {
                const own = scopeOf(option.id) === 'shop';
                const label = words.option(option, split);
                const sub = !own
                  ? option.swatchColor
                    ? t('libColour')
                    : null
                  : option.swatchImage
                    ? t('photoSwatch')
                    : option.swatchColor
                      ? t('ownSwatch')
                      : null;
                return (
                  <div key={option.id} className="border-b border-line last:border-b-0">
                    <div className="flex min-h-[52px] items-center gap-3 px-4 py-2">
                      {own ? (
                        <button
                          type="button"
                          aria-label={t('swatchOf', { name: label })}
                          aria-expanded={painting === option.id}
                          onClick={() => {
                            setPainting(painting === option.id ? null : option.id);
                            setSwatch.reset();
                          }}
                        >
                          <SwatchDot swatch={option} on={painting === option.id} />
                        </button>
                      ) : (
                        <SwatchDot swatch={option} />
                      )}
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="text-[15px]">{label}</span>
                        {sub ? <span className="text-[13px] text-fg-muted">{sub}</span> : null}
                      </span>
                      <Button
                        tone="ghost"
                        size="xs"
                        aria-label={t('removeOption', { name: label })}
                        onClick={() => {
                          onRemoveOption(option);
                        }}
                      >
                        <Icon name="x" size={14} />
                      </Button>
                    </div>
                    {painting === option.id ? (
                      <div className="px-4 pt-1 pb-3.5 sm:pl-[60px]">
                        <SwatchPalette
                          name={label}
                          swatch={option}
                          busy={setSwatch.isPending}
                          error={setSwatch.isError ? errorText(setSwatch.error) : null}
                          onPaint={paint}
                        />
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : null}
          <div className={units.length > 0 ? 'grid gap-3 sm:grid-cols-[1fr_auto]' : ''}>
            <Field
              label={t('addOption')}
              value={typed}
              inputMode={number ? 'decimal' : undefined}
              placeholder={number ? t('amountPh') : t('optionPh')}
              error={add.isError ? errorText(add.error) : undefined}
              onChange={(event) => {
                setTyped(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return;
                const value = typedValue();
                if (value) insert([value]);
              }}
              suffix={
                <Button
                  tone="outline"
                  size="xs"
                  busy={add.isPending}
                  onClick={() => {
                    const value = typedValue();
                    if (value) insert([value]);
                  }}
                >
                  {t('insert')}
                </Button>
              }
            />
            {units.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                <span className="text-[14px] font-medium text-fg-muted">{t('unitL')}</span>
                <Segments
                  label={t('unitL')}
                  value={chosenUnit}
                  choices={units.map((each) => ({ value: each, label: t(`unit_${each}`) }))}
                  onChange={setUnit}
                />
              </div>
            ) : null}
          </div>
          <p className="text-[14px] text-fg-muted">{t('tapSwatch')}</p>
          {naming ? (
            <Field
              label={t('setName')}
              value={setName}
              maxLength={OPTION_SET_NAME_MAX_LENGTH}
              placeholder={t('setNamePh')}
              error={saveSet.isError ? errorText(saveSet.error) : undefined}
              onChange={(event) => {
                setSetName(event.target.value);
              }}
              suffix={
                <Button
                  tone="outline"
                  size="xs"
                  busy={saveSet.isPending}
                  onClick={() => {
                    const name = setName.trim();
                    if (name === '' || values.length === 0) return;
                    saveSet.mutate(
                      { name, options: values },
                      {
                        onSuccess: (made) => {
                          setNaming(false);
                          setSavedSet(made.name);
                        },
                      },
                    );
                  }}
                >
                  {t('save')}
                </Button>
              }
            />
          ) : values.length > 0 ? (
            <p>
              <button
                type="button"
                className="text-[14px] font-semibold text-primary underline"
                onClick={() => {
                  setSetName('');
                  saveSet.reset();
                  setNaming(true);
                }}
              >
                {t('saveSet')}
              </button>
              {savedSet ? (
                <span role="status" className="ml-2 text-[14px] text-fg-muted">
                  {t('setSaved', { name: savedSet })}
                </span>
              ) : null}
            </p>
          ) : null}
          <p>
            <button
              type="button"
              className="text-[14px] font-semibold text-danger-text underline"
              onClick={onRemoveAttribute}
            >
              {t('removeFrom')}
            </button>
          </p>
        </div>
      ) : null}
    </Sheet>
  );
}
