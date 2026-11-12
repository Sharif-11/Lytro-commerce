import type { ReactNode } from 'react';
import type { ShopperItem, TaxLine } from '@/lib/api/storefront-api';
import { money, plainNumber, type Words } from '@/lib/i18n/words';
import { quantityText } from '@/lib/order/order-form';
import { Icon } from '../icon';

// The prototype's order lines and totals (`e48Line`, `e48Sum`), as the checkout, the landing page and tracking show them.

/** A line's photo, or the first letter of its name in the same tile. */
export function LineThumb({ name, image }: { name: string; image: string | null }) {
  return image ? (
    <img className="th photo" src={image} alt="" />
  ) : (
    <span className="th">{Array.from(name.trim())[0]}</span>
  );
}

/** What a line carries besides its name, each on a row of its own: a combo's parts, its add-ons, the shopper's answers. */
export function LineExtras({
  parts,
  addOns,
  answers,
  words,
}: {
  parts?: string | null;
  addOns?: readonly { name: string; price: string }[];
  answers?: readonly { name: string; value: string }[];
  words: Words;
}) {
  return (
    <>
      {parts ? <div className="vr">{words.t('e48Choices', { x: parts })}</div> : null}
      {addOns?.map((row) => (
        <div className="vr" key={row.name}>
          {words.t('e48AddOn', { a: row.name })} {money(row.price)}
        </div>
      ))}
      {answers?.map((row) => (
        <div className="vr" key={row.name}>
          {row.name}: {row.value}
        </div>
      ))}
    </>
  );
}

/** One item in a summary: its photo, name, options and quantity, what it carries, and its total. */
export function SummaryLine({
  name,
  image,
  detail,
  total,
  children,
}: {
  name: string;
  image: string | null;
  detail: string;
  total: number | string;
  children?: ReactNode;
}) {
  return (
    <div className="cl">
      <LineThumb name={name} image={image} />
      <div className="b">
        <div className="nm">{name}</div>
        <div className="vr">{detail}</div>
        {children}
        <div className="row">
          <span />
          <span className="price">{money(total)}</span>
        </div>
      </div>
    </div>
  );
}

/** An ordered item's values and quantity with its unit ("54 × 1 পিস"); the server leaves out a design's name (PD-6). */
export function itemDetail(item: ShopperItem, words: Words): string {
  const options = item.attributes.map((row) => row.value).join(' · ');
  const quantity = quantityText(item.quantity, item.stockUnit, words);
  return options === '' ? `× ${quantity}` : `${options} × ${quantity}`;
}

/** An item left out of the total: why, and Remove. */
export function OffLine({
  name,
  image,
  detail,
  note,
  words,
  onRemove,
}: {
  name: string;
  image: string | null;
  detail: string;
  note: string;
  words: Words;
  onRemove: () => void;
}) {
  return (
    <div className="cl off">
      <LineThumb name={name} image={image} />
      <div className="b">
        <div className="nm">{name}</div>
        {detail !== '' ? <div className="vr">{detail}</div> : null}
        <div className="note">{note}</div>
        <button type="button" className="rm" onClick={onRemove}>
          {words.t('remove')}
        </button>
      </div>
    </div>
  );
}

/** TAX-03: what a total includes, a row per class and rate, under it. */
export function TaxRows({ taxes, words }: { taxes: readonly TaxLine[]; words: Words }) {
  return (
    <>
      {taxes.map((tax) => (
        <div className="r" key={`${tax.name} ${tax.rate}`}>
          <span className="k">
            {words.t('tax_in', { name: tax.name, rate: plainNumber(tax.rate) })}
          </span>
          <span>{money(tax.amount)}</span>
        </div>
      ))}
    </>
  );
}

/** A bold line and a sentence under it, as every refusal on these pages reads. */
export function NoticeBanner({
  tone,
  title,
  text,
}: {
  tone: 'bad' | 'warn';
  title: string;
  text: string;
}) {
  return (
    <div className={`banner ${tone}`} role="alert">
      <Icon name="warn" />
      <span>
        <b>{title}</b>
        <br />
        {text}
      </span>
    </div>
  );
}
