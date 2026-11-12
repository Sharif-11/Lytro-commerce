'use client';

import { measureOf } from '@lytronix/validators/common';
import {
  AttributeDataType,
  ItemCondition,
  PaymentPolicy,
  StockState,
  StockUnit,
  type UnitKind,
} from '@lytronix/validators/enums';
import { type ReactNode, type Ref, useState } from 'react';
import type {
  DeliveryEstimate,
  DeliveryZoneView,
  OptionValue,
  ProductAttribute,
  ProductVariant,
  PublicProduct,
} from '@/lib/api/storefront-api';
import { countWord } from '@/lib/order/order-form';
import { designSoldOut, type PhotoCard } from '@/lib/product/designs';
import { quantityRule, stepped, typedQuantity } from '@/lib/product/quantity';
import type { Selection, VariantChoice } from '@/lib/product/variant-choice';
import { money, plainNumber, type Words } from '@/lib/i18n/words';
import { Icon } from '../icon';

// The prototype's buy box, part by part (docs/brand/lytro-storefront.html, buyBox and landingPage), each filled from the
// product the server gave.

/** The price row: the picked variant's own price (SFT-04), or the product's range before a variant is named. */
export function PriceRow({
  product,
  variant,
  soldOut,
  words,
}: {
  product: PublicProduct;
  variant: ProductVariant | null;
  soldOut: boolean;
  words: Words;
}) {
  const ranged =
    variant === null && product.maxPrice !== null && product.maxPrice !== product.minPrice;
  const price = variant?.price ?? product.minPrice;
  // CMB-09: a combo's price, then what its parts come to apart, and what it saves.
  const saving = product.combo?.saving ?? null;
  return (
    <div className="pricerow">
      {price !== null ? <span className="price">{money(price)}</span> : null}
      {ranged && product.maxPrice !== null ? (
        <span className="unit">– {money(product.maxPrice)}</span>
      ) : null}
      {saving !== null && price !== null ? (
        <>
          <span className="unit" style={{ textDecoration: 'line-through' }}>
            {money(Number(price) + Number(saving))}
          </span>
          <span className="st ok plain">{words.t('save', { n: plainNumber(saving) })}</span>
        </>
      ) : null}
      <StockChip
        state={soldOut ? StockState.Out : (variant?.stockState ?? product.stockState)}
        words={words}
      />
      {product.condition === ItemCondition.Used ? (
        <span className="st info plain">{words.t('cond_used')}</span>
      ) : product.condition === ItemCondition.Refurbished ? (
        <span className="st info plain">{words.t('cond_refurb')}</span>
      ) : null}
    </div>
  );
}

export function StockChip({ state, words }: { state: StockState; words: Words }) {
  if (state === StockState.Out) return <span className="st out">{words.t('out')}</span>;
  if (state === StockState.Low) return <span className="st low">{words.t('low')}</span>;
  return <span className="st ok">{words.t('in_stock')}</span>;
}

/** UOM-02: a measured value as it reads ("500 g", "1.5 kg"); a count, or any other value, as written. */
export function measureText(value: string, unitKind: UnitKind | null, words: Words): string {
  const { amount, unit } = measureOf(value, unitKind);
  return unit ? `${amount} ${words.t(`unit_${unit}`)}` : amount;
}

/** An option's value as a button names it. */
export function optionText(
  option: { dataType: AttributeDataType; unitKind: UnitKind | null },
  value: string,
  words: Words,
): string {
  return option.dataType === AttributeDataType.NumberWithUnit
    ? measureText(value, option.unitKind, words)
    : value;
}

function swatchStyle(value: OptionValue) {
  if (value.swatchImage) return { backgroundImage: `url("${value.swatchImage.urls.thumbnail}")` };
  return { background: value.swatchColor ?? 'var(--sunken)' };
}

/**
 * ATR-19, ATR-20 (PD-4, PD-17, `product-photos`): the product's design photos as cards, in the gallery's order, with no
 * name or number. A tap chooses that photo's design: the card is ringed and ticked, the design's other photos lightly
 * ringed. A design that can't be bought is greyed with "শেষ" and can't be chosen. `nudge` shakes them once, when the
 * shopper tried to buy before choosing.
 */
export function PhotoCards({
  product,
  cards,
  designId,
  tapped,
  nudge,
  words,
  onTap,
  cardsRef,
}: {
  product: PublicProduct;
  cards: PhotoCard[];
  designId: string | undefined;
  /** The photo tapped, of the chosen design; null when the design came from a link. */
  tapped: number | null;
  nudge: boolean;
  words: Words;
  onTap: (card: PhotoCard) => void;
  cardsRef?: Ref<HTMLDivElement>;
}) {
  if (cards.length === 0) return null;
  // The photo ringed and ticked: the one tapped, else (a shared link's design) its cover.
  const shown =
    cards.find((card) => card.designId === designId && card.at === tapped) ??
    cards.find((card) => card.designId === designId);
  return (
    <div className="opt" ref={cardsRef}>
      <div
        className={`pcards${cards.length > 5 ? ' many' : ''}${nudge ? ' nudge' : ''}`}
        role="radiogroup"
        aria-label={product.name}
      >
        {cards.map((card) => {
          const off = designSoldOut(product, card.designId);
          const on = card === shown;
          const same = !on && designId !== undefined && card.designId === designId;
          return (
            <button
              key={card.at}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={words.t('pd_photo', { n: card.at + 1 })}
              className={`pcard${on ? ' on' : ''}${same ? ' same' : ''}${off ? ' off' : ''}`}
              disabled={off}
              onClick={() => {
                onTap(card);
              }}
            >
              <i style={{ backgroundImage: `url("${card.image.urls.thumbnail}")` }} />
              <span className="tk">
                <Icon name="check" />
              </span>
              {off ? <b>{words.t('out')}</b> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** ATR-04, ATR-07, ATR-18: one row per variant-defining attribute; a value that names nothing buyable with the other
    picks is struck through, but can still be picked, so the shopper sees why. The size chart's link sits on the first
    row, as drawn. The designs option is chosen by its photos instead (PD-4), so it has no row. */
export function OptionRows({
  product,
  choice,
  selection,
  words,
  onPick,
  sizeChartLink,
}: {
  product: PublicProduct;
  choice: VariantChoice;
  selection: Selection;
  words: Words;
  onPick: (attributeId: string, valueId: string) => void;
  sizeChartLink: ReactNode;
}) {
  const rows = product.options.filter((option) => !option.designs);
  if (rows.length === 0) {
    return sizeChartLink ? (
      <div className="opt">
        <div className="lb">
          <span />
          {sizeChartLink}
        </div>
      </div>
    ) : null;
  }
  return (
    <>
      {rows.map((option, row) => {
        const pickedId = selection[option.attributeId];
        const picked = option.values.find((value) => value.id === pickedId);
        const swatches = option.values.some((value) => value.swatchColor ?? value.swatchImage);
        return (
          <div className="opt" key={option.attributeId}>
            <div className="lb">
              <span>
                {option.name}: <b>{picked ? optionText(option, picked.value, words) : '—'}</b>
              </span>
              {row === 0 ? sizeChartLink : null}
            </div>
            <div className="vals" role="group" aria-label={option.name}>
              {option.values.map((value) => {
                const text = optionText(option, value.value, words);
                const on = value.id === pickedId;
                const off = !choice.canBuyWith(selection, option.attributeId, value.id);
                const className = `${swatches ? 'swb' : 'vb'}${on ? ' on' : ''}${off ? ' off' : ''}`;
                return (
                  <button
                    key={value.id}
                    type="button"
                    className={className}
                    aria-pressed={on}
                    aria-label={swatches ? text : undefined}
                    title={swatches ? text : undefined}
                    onClick={() => {
                      onPick(option.attributeId, value.id);
                    }}
                  >
                    {swatches ? <i style={swatchStyle(value)} /> : text}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </>
  );
}

const UNIT_WORD = {
  [StockUnit.Kg]: 'unit_kg',
  [StockUnit.G]: 'unit_g',
  [StockUnit.Liter]: 'unit_l',
  [StockUnit.Ml]: 'unit_ml',
} as const;

function unitName(unit: StockUnit | undefined, words: Words): string {
  return unit === undefined || !(unit in UNIT_WORD)
    ? ''
    : words.t(UNIT_WORD[unit as keyof typeof UNIT_WORD]);
}

// UOM-05 (PD-19): the units a count is in; a measured unit sold in whole packs (INV-24) keeps its plain number.
const COUNTED: StockUnit[] = [StockUnit.Piece, StockUnit.Dozen, StockUnit.Pack, StockUnit.Box];
const counted = (unit: StockUnit | undefined) =>
  (unit ?? StockUnit.Piece) as StockUnit.Piece | StockUnit.Dozen | StockUnit.Pack | StockUnit.Box;

/** The quantity: whole numbers from one, with its unit ("1 পিস"). */
export function Quantity({
  value,
  unit,
  sharedStock = false,
  words,
  onChange,
}: {
  value: number;
  unit?: StockUnit;
  sharedStock?: boolean;
  words: Words;
  onChange: (next: number) => void;
}) {
  return (
    <div className="opt">
      <div className="lb">
        <span>{words.t('qty')}</span>
      </div>
      <Stepper
        value={value}
        unit={unit}
        sharedStock={sharedStock}
        words={words}
        onChange={onChange}
      />
    </div>
  );
}

/**
 * The quantity stepper itself, as the product page and each cart line draw it; a measured product's number can be typed,
 * and shows its unit (LND-07, UOM-04).
 */
export function Stepper({
  value,
  unit,
  sharedStock = false,
  words,
  onChange,
}: {
  value: number;
  unit?: StockUnit;
  sharedStock?: boolean;
  words: Words;
  onChange: (next: number) => void;
}) {
  const rule = quantityRule(unit, sharedStock);
  const [typed, setTyped] = useState<string | null>(null);
  if (rule.measured) {
    return (
      <span className="qty measured">
        <button
          type="button"
          aria-label="−"
          disabled={value <= rule.step}
          onClick={() => {
            setTyped(null);
            onChange(stepped(value, -rule.step, rule));
          }}
        >
          <Icon name="minus" />
        </button>
        <input
          inputMode="decimal"
          aria-label={words.t('qty')}
          value={typed ?? String(value)}
          onChange={(event) => {
            setTyped(event.target.value);
            const next = typedQuantity(event.target.value, rule);
            if (next !== null) onChange(next);
          }}
          onBlur={() => {
            setTyped(null);
          }}
        />
        <span className="u">{unitName(unit, words)}</span>
        <button
          type="button"
          aria-label="+"
          disabled={value >= rule.limit}
          onClick={() => {
            setTyped(null);
            onChange(stepped(value, rule.step, rule));
          }}
        >
          <Icon name="plus" />
        </button>
      </span>
    );
  }
  return (
    <span className="qty">
      <button
        type="button"
        aria-label="−"
        disabled={value <= 1}
        onClick={() => {
          onChange(Math.max(1, value - 1));
        }}
      >
        <Icon name="minus" />
      </button>
      <span aria-live="polite">
        {unit === undefined || COUNTED.includes(unit)
          ? `${String(value)} ${countWord(counted(unit), value, words)}`
          : value}
      </span>
      <button
        type="button"
        aria-label="+"
        disabled={value >= rule.limit}
        onClick={() => {
          onChange(Math.min(rule.limit, value + 1));
        }}
      >
        <Icon name="plus" />
      </button>
    </span>
  );
}

/** A delivery range as the estimate gives it: one amount when every zone costs the same. */
export function rangeText(range: { from: string; to: string }, words: Words): string {
  return Number(range.from) === Number(range.to)
    ? money(range.from)
    : words.t('deliv_range', { from: money(range.from), to: money(range.to) });
}

/** SFT-20: the delivery line: the exact charge once the shopper's area is known, else the range and a way to set it. */
export function DeliveryLine({
  estimate,
  areaSet,
  words,
  onArea,
}: {
  estimate: DeliveryEstimate | null;
  areaSet: boolean;
  words: Words;
  onArea: () => void;
}) {
  const link = (key: 'change' | 'deliv_area') => (
    <button type="button" className="lnk" onClick={onArea}>
      {words.t(key)}
    </button>
  );
  if (areaSet && estimate?.zone && estimate.deliverable && estimate.deliveryCharge !== null) {
    return (
      <div className="line">
        <Icon name="truck" />
        <span>
          <b>{words.t('deliv_est')}</b>:{' '}
          {words.t('deliv_to', {
            a: words.pick(estimate.zone.name),
            n: plainNumber(estimate.deliveryCharge),
          })}{' '}
          {link('change')}
        </span>
      </div>
    );
  }
  return (
    <div className="line">
      <Icon name="truck" />
      <span>
        <b>{words.t('deliv_est')}</b>
        {estimate?.range ? `: ${rangeText(estimate.range, words)}` : ''} ·{' '}
        {link(areaSet ? 'change' : 'deliv_area')}
      </span>
    </div>
  );
}

/** PRD-08: how the product is paid for. */
export function PayLine({ product, words }: { product: PublicProduct; words: Words }) {
  const advance = product.advanceAmount === null ? '0' : plainNumber(product.advanceAmount);
  const [title, hint] =
    product.paymentPolicy === PaymentPolicy.PartialAdvance
      ? [words.t('pay_adv', { n: advance }), words.t('pay_adv_hint', { n: advance })]
      : product.paymentPolicy === PaymentPolicy.FullPrepayment
        ? [words.t('pay_full'), null]
        : product.paymentPolicy === PaymentPolicy.DeliveryChargeOnly
          ? [words.t('pay_dc'), null]
          : [words.t('pay_cod'), words.t('pay_cod_hint')];
  return (
    <div className="line">
      <Icon name="cash" />
      <span>
        <b>{title}</b>
        {hint ? ` · ${hint}` : ''}
      </span>
    </div>
  );
}

/** DLV-06, DLV-07: "Delivers to … only" when the shop's zones or the product's own list leave some zones out. */
export function LimitedLine({
  product,
  zones,
  words,
}: {
  product: PublicProduct;
  zones: DeliveryZoneView[];
  words: Words;
}) {
  const listed = product.deliveryZoneIds;
  const reach = zones.filter(
    (zone) => !zone.noDelivery && (listed.length === 0 || listed.includes(zone.id)),
  );
  if (reach.length === 0 || reach.length === zones.length) return null;
  return (
    <div className="line">
      <Icon name="pin" />
      <span>
        <b>
          {words.t('delivers_only', { z: reach.map((zone) => words.pick(zone.name)).join(', ') })}
        </b>
      </span>
    </div>
  );
}

/** ATR-04: one informational detail's value, as the shop set it. */
function attributeValue(attribute: ProductAttribute, words: Words): string {
  if (attribute.dataType === AttributeDataType.Boolean) {
    return attribute.yes === null ? '' : words.t(attribute.yes ? 'attr_yes' : 'attr_no');
  }
  if (attribute.number !== null) return measureText(attribute.number, attribute.unitKind, words);
  if (attribute.text !== null) return attribute.text;
  return attribute.values.map((value) => optionText(attribute, value, words)).join(', ');
}

/** The product's informational details as the prototype's two-column list. */
export function DetailsList({
  attributes,
  words,
}: {
  attributes: ProductAttribute[];
  words: Words;
}) {
  return (
    <div className="kv">
      {attributes.map((attribute) => (
        <DetailRow
          key={attribute.name}
          name={attribute.name}
          value={attributeValue(attribute, words)}
        />
      ))}
    </div>
  );
}

function DetailRow({ name, value }: { name: string; value: string }) {
  return (
    <>
      <span className="k">{name}</span>
      <span className="v">{value}</span>
    </>
  );
}
