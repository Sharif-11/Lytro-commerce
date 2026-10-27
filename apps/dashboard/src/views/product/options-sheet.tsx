import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AttributeDataType, MediaPurpose, OPTION_SET_NAME_MAX_LENGTH } from '@lytronix/validators';
import { useAddOptions, useSaveOptionSet, useSetSwatch } from '@/api/attributes';
import { Icon } from '@/components/icon';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chips';
import { Field } from '@/components/ui/field';
import { Eyebrow } from '@/components/ui/page';
import { Sheet } from '@/components/ui/sheet';
import { useErrorText } from '@/hooks/use-error-text';
import { baseValueOf, MEASURE_UNITS, type MeasureUnit } from '@/lib/measure';
import { MediaUpload } from '@/lib/media-upload';
import { setsFor, type SplitAttribute } from '@/lib/variant-matrix';
import { tenantSession } from '@/session/tenant-session';
import type { Attribute, OptionSet } from '@/types/attribute';
import type { OptionSwatch, UsedOption } from '@/types/product';
import { Segments } from './value-sheet';
import { useVariantWords } from './variant-words';

/** The six colours the palette draws; any other comes from the browser's colour picker (11.7b read). */
const PALETTE = ['#10201F', '#1D4ED8', '#C8323B', '#1B7A43', '#F2A516', '#FFFFFF'];

const sameColour = (a: string | null, b: string): boolean => a?.toUpperCase() === b;

/** An option's swatch beside its name: dashed when it has none, a colour, or a small picture. */
function SwatchDot({ swatch, on }: { swatch: OptionSwatch; on?: boolean }): React.JSX.Element {
  return (
    <span
      className={[
        'flex size-8 flex-none items-center justify-center overflow-hidden rounded-full',
        on ? 'shadow-[0_0_0_2px_var(--color-surface),0_0_0_4px_var(--color-primary)]' : '',
        swatch.swatchImage || swatch.swatchColor
          ? 'border border-black/12'
          : 'border-[1.5px] border-dashed border-line-strong bg-surface',
      ].join(' ')}
      style={swatch.swatchColor ? { background: swatch.swatchColor } : undefined}
    >
      {swatch.swatchImage ? (
        <img src={swatch.swatchImage.urls.thumbnail} alt="" className="size-full object-cover" />
      ) : null}
    </span>
  );
}

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
  const setSwatch = useSetSwatch();
  const saveSet = useSaveOptionSet();
  const upload = useMemo(() => new MediaUpload(tenantSession.client), []);
  const photoInput = useRef<HTMLInputElement>(null);
  const colourInput = useRef<HTMLInputElement>(null);
  const [typed, setTyped] = useState('');
  const [unit, setUnit] = useState<MeasureUnit | null>(null);
  const [painting, setPainting] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
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

  function paint(swatch: { swatchColor: string | null } | { swatchImageId: string | null }): void {
    if (!split || !painted) return;
    setSwatch.mutate(
      { attributeId: split.attributeId, optionId: painted.id, swatch },
      {
        onSuccess: (saved) => {
          onSwatch(saved.id, { swatchColor: saved.swatchColor, swatchImage: saved.swatchImage });
        },
      },
    );
  }

  async function paintPhoto(file: File): Promise<void> {
    setUploading(true);
    setUploadError(null);
    try {
      const media = await upload.upload(file, MediaPurpose.SwatchImage);
      paint({ swatchImageId: media.id });
    } catch (error) {
      setUploadError(errorText(error));
    } finally {
      setUploading(false);
    }
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
                            setUploadError(null);
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
                      <div className="flex flex-col gap-2 px-4 pt-1 pb-3.5 sm:pl-[60px]">
                        <Eyebrow>{t('swatchFor', { name: label })}</Eyebrow>
                        <div className="flex flex-wrap gap-2">
                          {PALETTE.map((colour) => (
                            <Chip
                              key={colour}
                              size="lg"
                              aria-label={colour}
                              on={sameColour(option.swatchColor, colour)}
                              disabled={setSwatch.isPending}
                              onClick={() => {
                                paint({ swatchColor: colour });
                              }}
                            >
                              <span
                                className="size-5 rounded-full border border-black/12"
                                style={{ background: colour }}
                              />
                            </Chip>
                          ))}
                          <Chip
                            size="lg"
                            on={
                              option.swatchColor !== null &&
                              !PALETTE.some((colour) => sameColour(option.swatchColor, colour))
                            }
                            disabled={setSwatch.isPending}
                            onClick={() => colourInput.current?.click()}
                          >
                            {option.swatchColor &&
                            !PALETTE.some((colour) => sameColour(option.swatchColor, colour)) ? (
                              <span
                                className="size-5 rounded-full border border-black/12"
                                style={{ background: option.swatchColor }}
                              />
                            ) : null}
                            {t('otherColour')}
                          </Chip>
                          <Chip
                            size="lg"
                            on={option.swatchImage !== null}
                            disabled={uploading || setSwatch.isPending}
                            onClick={() => photoInput.current?.click()}
                          >
                            <Icon name="camera" size={16} />
                            {t('fromPhoto')}
                          </Chip>
                          <Chip
                            size="lg"
                            on={option.swatchColor === null && option.swatchImage === null}
                            disabled={setSwatch.isPending}
                            onClick={() => {
                              paint({ swatchColor: null });
                            }}
                          >
                            {t('noSwatch')}
                          </Chip>
                        </div>
                        {uploadError || setSwatch.isError ? (
                          <p role="alert" className="text-[13px] font-medium text-danger-text">
                            {uploadError ?? errorText(setSwatch.error)}
                          </p>
                        ) : null}
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
          <input
            ref={photoInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void paintPhoto(file);
              event.target.value = '';
            }}
          />
          <input
            ref={colourInput}
            type="color"
            hidden
            onChange={(event) => {
              paint({ swatchColor: event.target.value.toUpperCase() });
            }}
          />
        </div>
      ) : null}
    </Sheet>
  );
}
