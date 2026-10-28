import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AttributeRole, StockState, type StockUnit } from '@lytronix/validators';
import { useAddOptions, useAttributes, useOptionSets } from '@/api/attributes';
import { Icon } from '@/components/icon';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ChipRow } from '@/components/ui/chips';
import { chipClass } from '@/components/ui/classes';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { StatusTag } from '@/components/ui/status-tag';
import { Switch } from '@/components/ui/switch';
import type { ProductForm } from '@/lib/product-form';
import {
  combinations,
  describedValue,
  fillAll,
  keyOf,
  overLimit,
  blankRow,
  reconcile,
  setsFor,
  variantCount,
  type Description,
  type FillColumn,
  type SplitAttribute,
  type VariantRow,
} from '@/lib/variant-matrix';
import type { Attribute, ProductStock } from '@/types/attribute';
import type { OptionSwatch, ProductDetail, UsedOption } from '@/types/product';
import { AddAttributeSheet } from './add-attribute-sheet';
import { FillSheet } from './fill-sheet';
import { OptionsSheet } from './options-sheet';
import { ValueSheet } from './value-sheet';
import { VariantSheet } from './variant-sheet';
import { VariantTable } from './variant-table';
import { useVariantWords } from './variant-words';

/** What the product is, as far as its variant table goes: counted or made to order, with serials or not, in a unit. */
export interface StockKind {
  tracked: boolean;
  serial: boolean;
  unit: StockUnit;
}

/** A change that would stop variants holding stock from selling, waiting on the seller's answer (Part 14). */
interface Question {
  title: string;
  text: string;
  /** The way back, and the way on. */
  stay: string;
  go: string;
  apply: () => void;
}

const isSplit = (role: AttributeRole): boolean => role === AttributeRole.VariantDefining;

/**
 * Options and variants (TENANT-DASHBOARD-DESIGN §7.4's second card, the prototype's `pfVariants` and Part 14; ATR-04,
 * ATR-11, ATR-14, ATR-16, ATR-17, ATL-02, INV-24): Add attribute, the category's suggestions, each attribute as a mini
 * card with its role -- splitting ones with their options, describing ones with their value, asked ones with what the
 * shopper writes -- "Sizes share one stock", and the variant table. Removing an option, or the attribute, whose
 * variants hold stock asks first, as does splitting a product whose variants hold stock by one more attribute (every
 * combination changes): they stop selling once saved, and their stock stays.
 */
export function VariantsCard({
  form,
  saved,
  product,
  kind,
  suggestedIds,
  stock,
  readOnly,
  problems,
  onChange,
}: {
  form: ProductForm;
  saved: ProductForm;
  product: ProductDetail | null;
  kind: StockKind;
  suggestedIds: readonly string[];
  /** What each variant holds, for someone who may see stock; undefined otherwise. */
  stock: ProductStock | undefined;
  readOnly: boolean;
  /** The server's problems with the options and variants, by field. */
  problems: Readonly<Record<string, string>>;
  onChange: (patch: Partial<ProductForm>) => void;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  const words = useVariantWords();
  const attributes = useAttributes();
  const optionSets = useOptionSets();
  const insertSet = useAddOptions();
  const [adding, setAdding] = useState<{ preselect: string | null } | null>(null);
  const [optionsOf, setOptionsOf] = useState<string | null>(null);
  const [valueOf, setValueOf] = useState<string | null>(null);
  const [filling, setFilling] = useState<FillColumn | null>(null);
  const [question, setQuestion] = useState<Question | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [variantAt, setVariantAt] = useState<number | null>(null);
  const titleId = useId();
  const library = attributes.data ?? [];
  const libraryOf = (id: string): Attribute | undefined => library.find((each) => each.id === id);
  const isNew = product === null;
  const shared = form.sharedStock && kind.tracked && !kind.serial;

  /** The splits as they now stand, the rows following; a variant added to a saved product opens the table in full. */
  function setSplits(splits: SplitAttribute[], extra: Partial<ProductForm> = {}): void {
    const variants = reconcile(splits, form.variants, saved.variants);
    if (!isNew && variants.some((row) => row.id === null)) setShowAll(true);
    onChange({ splits, variants, ...extra });
  }

  /** What the saved variants these rows leave hold: how much, by whom, or that they hold some (no stock read). */
  function heldBy(
    leaving: readonly VariantRow[],
  ): { total: number; rows: string[] } | 'some' | null {
    const ids = leaving.flatMap((row) => (row.id === null ? [] : [row.id]));
    if (ids.length === 0) return null;
    if (stock) {
      const held = stock.variants
        .filter((each) => ids.includes(each.variantId) && Number(each.onHand ?? 0) > 0)
        .map((each) => ({
          row: leaving.find((row) => row.id === each.variantId),
          onHand: Number(each.onHand),
        }));
      if (held.length === 0) return null;
      return {
        total: held.reduce((sum, each) => sum + each.onHand, 0),
        rows: held.map(
          (each) =>
            `${words.variant(each.row?.optionIds ?? [], form.splits)} (${String(each.onHand)})`,
        ),
      };
    }
    const selling = product?.variants.filter(
      (variant) => ids.includes(variant.id) && variant.stockState !== StockState.Out,
    );
    return selling && selling.length > 0 ? 'some' : null;
  }

  /** The rows a change to the splits would leave behind. */
  function leavingWith(splits: SplitAttribute[]): VariantRow[] {
    const kept = new Set(combinations(splits).map(keyOf));
    return form.variants.filter((row) => !kept.has(keyOf(row.optionIds)));
  }

  /** Removing options or an attribute: at once, or after the question when what it leaves holds stock. */
  function removing(
    name: string,
    splits: SplitAttribute[],
    extra: Partial<ProductForm> = {},
  ): void {
    const held = shared ? null : heldBy(leavingWith(splits));
    const apply = () => {
      setSplits(splits, extra);
    };
    if (held === null) {
      apply();
      return;
    }
    setQuestion({
      title: t('rmTitle', { name }),
      text:
        held === 'some'
          ? t('rmVague', { name })
          : held.rows.length === 1
            ? t('rmOne', { variant: held.rows[0], total: held.total, name })
            : t('rmMany', {
                name,
                count: held.rows.length,
                total: held.total,
                first: held.rows[0],
                second: held.rows[1],
              }),
      stay: t('keep'),
      go: t('remove'),
      apply,
    });
  }

  function removeOption(split: SplitAttribute, option: UsedOption): void {
    removing(
      words.option(option, split),
      form.splits.map((each) =>
        each.attributeId === split.attributeId
          ? { ...each, options: each.options.filter((one) => one.id !== option.id) }
          : each,
      ),
    );
  }

  function removeSplit(split: SplitAttribute): void {
    setOptionsOf(null);
    removing(
      split.name,
      form.splits.filter((each) => each.attributeId !== split.attributeId),
      form.splits.length === 1 ? { sharedStock: false } : {},
    );
  }

  function add(attribute: Attribute, role: AttributeRole): void {
    setAdding(null);
    if (!isSplit(role)) {
      const description: Description = {
        attributeId: attribute.id,
        name: attribute.name,
        dataType: attribute.dataType,
        unitKind: attribute.unitKind,
        role: role === AttributeRole.CapturedAtOrder ? role : AttributeRole.Informational,
        optionIds: [],
        optionValues: [],
        text: '',
        number: '',
        bool: null,
      };
      onChange({ descriptions: [...form.descriptions, description] });
      if (role === AttributeRole.Informational) setValueOf(attribute.id);
      return;
    }
    const split: SplitAttribute = {
      attributeId: attribute.id,
      name: attribute.name,
      dataType: attribute.dataType,
      unitKind: attribute.unitKind,
      options: [],
    };
    const apply = () => {
      setSplits([...form.splits, split]);
      setOptionsOf(attribute.id);
    };
    // Every combination gains an option, so every variant there now -- the one default variant of a product not yet
    // split -- stops selling once saved.
    const current: VariantRow[] =
      form.splits.length > 0
        ? form.variants
        : (product?.variants ?? []).map((variant) => ({ ...blankRow([]), id: variant.id }));
    const held = isNew || shared ? null : heldBy(current);
    if (held === null) {
      apply();
      return;
    }
    setQuestion({
      title: t('addTitle', { name: attribute.name }),
      text:
        held === 'some'
          ? t('addVague', { name: attribute.name })
          : t('addText', { name: attribute.name, total: held.total }),
      stay: t('cancel'),
      go: t('addGo'),
      apply,
    });
  }

  const openSplit = form.splits.find((each) => each.attributeId === optionsOf) ?? null;
  const openValue = form.descriptions.find((each) => each.attributeId === valueOf) ?? null;
  const taken = [
    ...form.splits.map((each) => each.attributeId),
    ...form.descriptions.map((each) => each.attributeId),
  ];
  const suggestions = suggestedIds
    .filter((id) => !taken.includes(id))
    .map(libraryOf)
    .filter((each): each is Attribute => each !== undefined && !each.retired);
  const over = overLimit(form.splits);
  const canSell =
    !isNew && kind.tracked && !shared && stock
      ? new Map(stock.variants.map((each) => [each.variantId, each.available]))
      : null;
  const holdsStock =
    product !== null &&
    (stock
      ? stock.variants.some((each) => Number(each.onHand ?? 0) > 0) ||
        Number(stock.shared?.onHand ?? 0) > 0
      : product.stockState !== StockState.Out);
  const sets = (split: SplitAttribute) => setsFor(split.options, optionSets.data ?? []);
  const rowProblems = Object.entries(problems)
    .filter(([field]) => field.startsWith('variants.') || field.startsWith('attributes'))
    .map(([, message]) => message);

  return (
    <Card role="region" aria-labelledby={titleId} className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 id={titleId} className="text-[17px] font-semibold whitespace-nowrap">
          {t('optionsVariants')}
        </h2>
        {readOnly ? null : (
          <button
            type="button"
            className="flex items-center gap-1 text-[14px] font-semibold whitespace-nowrap text-primary"
            onClick={() => {
              setAdding({ preselect: null });
            }}
          >
            <Icon name="plus" size={16} />
            {t('addAttribute')}
          </button>
        )}
      </div>
      {suggestions.length > 0 && !readOnly ? (
        <p className="text-[14px] text-fg-muted">
          {t('suggestedAttrs')}:{' '}
          {suggestions.map((each, index) => (
            <span key={each.id}>
              {index > 0 ? ' · ' : null}
              <button
                type="button"
                className="underline"
                onClick={() => {
                  setAdding({ preselect: each.id });
                }}
              >
                {each.name}
              </button>
            </span>
          ))}
        </p>
      ) : null}
      {form.splits.map((split) => (
        <div key={split.attributeId} className="rounded-card border border-line bg-neutral-50 p-3">
          <h3 className="flex items-center gap-2 text-[17px] font-semibold">
            <button
              type="button"
              disabled={readOnly}
              onClick={() => {
                setOptionsOf(split.attributeId);
              }}
            >
              {split.name}
            </button>
            <StatusTag tone="info" small>
              {t('roleSplits')}
            </StatusTag>
          </h3>
          <ChipRow className="mt-2">
            {split.options.map((option) => (
              <span key={option.id} className={chipClass(false, 'sm')}>
                {option.swatchColor || option.swatchImage ? (
                  <span
                    className="size-3 flex-none overflow-hidden rounded-full border border-black/12"
                    style={option.swatchColor ? { background: option.swatchColor } : undefined}
                  >
                    {option.swatchImage ? (
                      <img
                        src={option.swatchImage.urls.thumbnail}
                        alt=""
                        className="size-full object-cover"
                      />
                    ) : null}
                  </span>
                ) : null}
                {words.option(option, split)}
                {readOnly ? null : (
                  <button
                    type="button"
                    aria-label={t('removeOption', { name: words.option(option, split) })}
                    onClick={() => {
                      removeOption(split, option);
                    }}
                  >
                    <Icon name="x" size={14} />
                  </button>
                )}
              </span>
            ))}
            {readOnly ? null : (
              <button
                type="button"
                className={`${chipClass(false, 'sm')} border-dashed text-primary`}
                onClick={() => {
                  setOptionsOf(split.attributeId);
                }}
              >
                <Icon name="plus" size={14} />
                {t('addOption')}
              </button>
            )}
          </ChipRow>
          {split.options.length === 0 ? (
            <p className="mt-2 text-[13px] font-medium text-danger-text">
              {t('needOption', { name: split.name })}
            </p>
          ) : null}
          {!readOnly && sets(split).length > 0 ? (
            <p className="mt-2 text-[14px] text-fg-muted">
              {t('optionSets')}:{' '}
              {sets(split).map((set, index) => (
                <span key={set.id}>
                  {index > 0 ? ' · ' : null}
                  <button
                    type="button"
                    className="underline"
                    disabled={insertSet.isPending}
                    onClick={() => {
                      insertSet.mutate(
                        { attributeId: split.attributeId, values: set.options },
                        {
                          onSuccess: (made) => {
                            const have = new Set(split.options.map((option) => option.id));
                            setSplits(
                              form.splits.map((each) =>
                                each.attributeId === split.attributeId
                                  ? {
                                      ...each,
                                      options: [
                                        ...each.options,
                                        ...made
                                          .filter((option) => !have.has(option.id))
                                          .map((option) => ({
                                            id: option.id,
                                            value: option.value,
                                            swatchColor: option.swatchColor,
                                            swatchImage: option.swatchImage,
                                          })),
                                      ],
                                    }
                                  : each,
                              ),
                            );
                          },
                        },
                      );
                    }}
                  >
                    {set.name}
                  </button>
                </span>
              ))}
            </p>
          ) : null}
        </div>
      ))}
      {form.descriptions.map((each) => {
        const asked = each.role === AttributeRole.CapturedAtOrder;
        const value = describedValue(each, {
          yes: t('yes'),
          no: t('no'),
          measure: (number) => words.measure(number, each.unitKind),
        });
        return (
          <button
            key={each.attributeId}
            type="button"
            disabled={readOnly}
            className="rounded-card border border-line bg-neutral-50 p-3 text-left"
            onClick={() => {
              setValueOf(each.attributeId);
            }}
          >
            <span className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-[17px] font-semibold">
                {each.name}
                <StatusTag tone={asked ? 'warn' : 'neutral'} small>
                  {asked ? t('roleAsked') : t('roleDescribes')}
                </StatusTag>
              </span>
              {asked ? null : <span className="text-[14px] text-fg-muted">{value ?? '—'}</span>}
            </span>
            {asked ? (
              <span className="mt-1.5 block text-[14px] text-fg-muted">
                {t('askedHint', { type: words.type(each.dataType).toLowerCase() })}
              </span>
            ) : null}
          </button>
        );
      })}
      {form.splits.length > 0 && kind.tracked && !kind.serial ? (
        <div className="flex min-h-10 items-center gap-3 py-1">
          <Switch
            checked={form.sharedStock}
            disabled={readOnly || holdsStock}
            label={t('sharedStock')}
            onChange={(sharedStock) => {
              onChange({ sharedStock });
            }}
          />
          <span className="flex flex-col">
            <span className="text-[15px] font-medium">{t('sharedStock')}</span>
            {form.sharedStock || holdsStock ? (
              <span className="flex items-center gap-1 text-[13px] text-fg-muted">
                {holdsStock ? <Icon name="lock" size={14} /> : null}
                {holdsStock
                  ? t(form.sharedStock ? 'sharedLocked' : 'sharedLockedOn')
                  : t('sharedHint', { unit: t(`su_${kind.unit}`) })}
              </span>
            ) : null}
          </span>
        </div>
      ) : null}
      {over ? (
        <Banner tone="bad">
          {t('overLimit', {
            names: form.splits.map((each) => each.name).join(' × '),
            count: variantCount(form.splits),
          })}
        </Banner>
      ) : form.variants.length > 0 ? (
        <VariantTable
          rows={form.variants}
          splits={form.splits}
          columns={{
            opening: isNew && kind.tracked && !shared,
            canSell,
            pack: shared ? kind.unit : null,
            sku: kind.tracked,
          }}
          basePrice={form.price}
          isNew={isNew}
          problems={problems}
          readOnly={readOnly}
          showAll={showAll}
          onShowAll={() => {
            setShowAll(true);
          }}
          onRow={(index, patch) => {
            onChange({
              variants: form.variants.map((row, at) => (at === index ? { ...row, ...patch } : row)),
            });
          }}
          onFill={setFilling}
          onOpen={setVariantAt}
        />
      ) : null}
      {isNew && shared && form.variants.length > 0 ? (
        <Field
          label={t('sharedOpening', { unit: t(`su_${kind.unit}`) })}
          inputMode="decimal"
          className="num"
          value={form.sharedOpeningStock}
          onChange={(event) => {
            onChange({ sharedOpeningStock: event.target.value });
          }}
        />
      ) : null}
      {rowProblems.length > 0 ? (
        <ul className="flex flex-col gap-1 text-[13px] font-medium text-danger-text">
          {rowProblems.map((message, index) => (
            <li key={index}>{message}</li>
          ))}
        </ul>
      ) : null}

      <AddAttributeSheet
        open={adding !== null}
        attributes={library}
        suggestedIds={suggestedIds}
        takenIds={taken}
        splitNames={form.splits.map((each) => each.name)}
        preselect={adding?.preselect ?? null}
        onAdd={add}
        onClose={() => {
          setAdding(null);
        }}
      />
      <OptionsSheet
        split={openSplit}
        attribute={openSplit ? libraryOf(openSplit.attributeId) : undefined}
        optionSets={optionSets.data ?? []}
        onInsert={(options) => {
          if (!openSplit) return;
          setSplits(
            form.splits.map((each) =>
              each.attributeId === openSplit.attributeId
                ? { ...each, options: [...each.options, ...options] }
                : each,
            ),
          );
        }}
        onRemoveOption={(option) => {
          if (openSplit) removeOption(openSplit, option);
        }}
        onSwatch={(optionId, swatch: OptionSwatch) => {
          onChange({
            splits: form.splits.map((each) => ({
              ...each,
              options: each.options.map((option) =>
                option.id === optionId ? { ...option, ...swatch } : option,
              ),
            })),
          });
        }}
        onRemoveAttribute={() => {
          if (openSplit) removeSplit(openSplit);
        }}
        onClose={() => {
          setOptionsOf(null);
        }}
      />
      <ValueSheet
        description={openValue}
        attribute={openValue ? libraryOf(openValue.attributeId) : undefined}
        readOnly={readOnly}
        onChange={(patch) => {
          onChange({
            descriptions: form.descriptions.map((each) =>
              each.attributeId === valueOf ? { ...each, ...patch } : each,
            ),
          });
        }}
        onRemove={() => {
          onChange({
            descriptions: form.descriptions.filter((each) => each.attributeId !== valueOf),
          });
          setValueOf(null);
        }}
        onClose={() => {
          setValueOf(null);
        }}
      />
      <VariantSheet
        row={variantAt === null ? null : (form.variants[variantAt] ?? null)}
        name={
          variantAt === null
            ? ''
            : words.variant(form.variants[variantAt]?.optionIds ?? [], form.splits)
        }
        settings={form.settings}
        readOnly={readOnly}
        onChange={(patch) => {
          onChange({
            variants: form.variants.map((row, at) =>
              at === variantAt ? { ...row, ...patch } : row,
            ),
          });
        }}
        onClose={() => {
          setVariantAt(null);
        }}
      />
      <FillSheet
        column={filling}
        splits={form.splits}
        rows={form.variants}
        onFill={(column, value, optionId) => {
          setFilling(null);
          onChange({ variants: fillAll(form.variants, column, value, optionId) });
        }}
        onClose={() => {
          setFilling(null);
        }}
      />
      <Dialog
        open={question !== null}
        title={question?.title ?? ''}
        onClose={() => {
          setQuestion(null);
        }}
        actions={
          <>
            <Button
              tone="outline"
              onClick={() => {
                setQuestion(null);
              }}
            >
              {question?.stay}
            </Button>
            <Button
              tone="danger"
              onClick={() => {
                question?.apply();
                setQuestion(null);
              }}
            >
              {question?.go}
            </Button>
          </>
        }
      >
        {question?.text}
      </Dialog>
    </Card>
  );
}
