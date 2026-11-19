import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { formatTaka } from '@lytronix/ui';
import type { LineAttribute, OrderComponent, OrderItem } from '@/types/orders';
import { quantityOf } from './order-auto';

// The owner, 2026-11-19 (the sketch's `oi-items`): an item at a glance, as small rounded chips -- the design and the SKU
// first, then the quantity in its unit with the price of one, then each option by its name, what the customer typed,
// the add-ons. Chips flow beside the photo and then under it; on a computer they stay beside it.

type ChipLook = 'plain' | 'quantity' | 'sku' | 'design';

const LOOK: Record<ChipLook, string> = {
  plain: 'bg-neutral-100',
  quantity:
    'bg-primary-soft shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--color-primary)_35%,transparent)] [&>b]:font-bold',
  sku: 'whitespace-nowrap bg-surface shadow-[inset_0_0_0_1px_var(--color-line)] [&>b]:font-mono [&>b]:tracking-[0.02em]',
  design: 'gap-x-1.5 bg-neutral-100 pl-1',
};

function Chip({ look = 'plain', children }: { look?: ChipLook; children: ReactNode }) {
  return (
    <span
      className={`mr-1.5 mb-1.5 inline-flex min-h-7 max-w-full flex-wrap items-center gap-x-1 rounded-full px-2.5 py-[3px] align-top text-[14px] leading-[1.3] text-fg-muted [overflow-wrap:anywhere] [&>b]:font-semibold [&>b]:text-fg ${LOOK[look]}`}
    >
      {children}
    </span>
  );
}

/** A count as typed on the order: 2, 1.5, never 2.000. */
const amountOf = (value: string | number): string => String(Number(value));

/** ATR-20 (PD-9): the design chosen, its photo as a dot; its value alone when it already says "Design 2". */
function DesignChip({ design, photo }: { design: LineAttribute; photo: string | null }) {
  return (
    <Chip look="design">
      {photo ? (
        <img
          src={photo}
          alt=""
          className="size-5 flex-none rounded-full object-cover shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)]"
        />
      ) : null}
      {design.value.startsWith(design.name) ? null : <span>{design.name}</span>}{' '}
      <b>{design.value}</b>
    </Chip>
  );
}

/** The chips both an order's line and a combo's item start with: the design, then the SKU. */
function IdChips({
  attributes,
  sku,
  photo,
}: {
  attributes: readonly LineAttribute[];
  sku: string | null;
  photo: string | null;
}) {
  const design = attributes.find((attribute) => attribute.design === true);
  return (
    <>
      {design ? <DesignChip design={design} photo={photo} /> : null}
      {sku ? (
        <Chip look="sku">
          SKU <b>{sku}</b>
        </Chip>
      ) : null}
    </>
  );
}

/** Each value that makes the variant, by its name, the design apart. */
function OptionChips({ attributes }: { attributes: readonly LineAttribute[] }) {
  return (
    <>
      {attributes
        .filter((attribute) => attribute.variantDefining && attribute.design !== true)
        .map((attribute) => (
          <Chip key={attribute.name}>
            {attribute.name}: <b>{attribute.value}</b>
          </Chip>
        ))}
    </>
  );
}

/** An order line's chips: design, SKU, the quantity in its unit and the price of one, options, typed text, add-ons. */
export function ItemChips({ item }: { item: OrderItem }): React.JSX.Element {
  const { t } = useTranslation('orders');
  const quantity = quantityOf(item);
  const combo = item.components.length > 0;
  return (
    <div className="leading-[0] lg:flow-root">
      <IdChips attributes={item.attributes} sku={item.sku} photo={item.thumbnail?.url ?? null} />
      <Chip look="quantity">
        <b>
          {combo
            ? t('qtyCombo', { count: Number(quantity.amount), n: quantity.amount })
            : t(`qty_${quantity.unit}`, { n: quantity.amount })}
        </b>{' '}
        <span className="num">× {formatTaka(item.unitPrice)}</span>
        {item.packAmount !== null ? (
          <span>
            {' '}
            ·{' '}
            {t('packTotal', {
              amount: t(`qty_${item.stockUnit}`, {
                n: amountOf(Number(item.quantity) * Number(item.packAmount)),
              }),
            })}
          </span>
        ) : null}
      </Chip>
      <OptionChips attributes={item.attributes} />
      {item.captured.map((each) => (
        <Chip key={each.attributeId}>
          {each.name}: <b>“{each.value}”</b>
        </Chip>
      ))}
      {item.modifiers.map((modifier) => (
        <Chip key={modifier.optionId}>
          {t('addOnLabel')}: <b>{modifier.optionName}</b>
          {Number(modifier.priceChange) !== 0 ? (
            <span className="num"> +{formatTaka(modifier.priceChange)}</span>
          ) : null}
        </Chip>
      ))}
      {Number(item.returnedQuantity) > 0 ? (
        <Chip>{t('backN', { count: Number(item.returnedQuantity) })}</Chip>
      ) : null}
    </div>
  );
}

/**
 * A combo's item: design, SKU, the units to pack for every combo on the line (and how many in each when more than
 * one), its options.
 */
export function ComponentChips({
  component,
  combos,
}: {
  component: OrderComponent;
  combos: string;
}): React.JSX.Element {
  const { t } = useTranslation('orders');
  const many = Number(combos) > 1;
  return (
    <div className="leading-[0] lg:flow-root">
      <IdChips
        attributes={component.attributes}
        sku={component.sku}
        photo={component.thumbnail?.url ?? null}
      />
      <Chip look="quantity">
        <b>
          {t(`qty_${component.stockUnit}`, {
            n: amountOf(Number(component.quantity) * Number(combos)),
          })}
        </b>
        {many ? <span> {t('perCombo', { n: amountOf(component.quantity) })}</span> : null}
      </Chip>
      <OptionChips attributes={component.attributes} />
    </div>
  );
}
