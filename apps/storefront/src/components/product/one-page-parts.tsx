'use client';

import { discountPercent } from '@lytronix/validators/common';
import { PaymentPolicy } from '@lytronix/validators/enums';
import { Fragment, type ReactNode, useState } from 'react';
import type { DeliveryZoneView, ProductVariant, PublicProduct } from '@/lib/api/storefront-api';
import { deliveryRange } from '@/lib/catalogue/browse';
import { money, plainNumber, type Words } from '@/lib/i18n/words';
import { Icon } from '../icon';
import { DetailsList, optionText } from './buy-parts';

// The one product page's own parts (the owner, 2026-11-24; the builder sketch's `pp-page`): what Bonik's page has that
// Lytro has the data for -- the delivery and payment chips, the trust strip, how ordering works, the questions, the
// product's facts and its photos again. Each is worked out from the shop's own settings; none says how the system works.

/** How the product is paid for, as the page's chips, steps and questions word it. */
export type PayKind = 'cod' | 'advance' | 'charge' | 'full';

export function payKindOf(product: PublicProduct): PayKind {
  switch (product.paymentPolicy) {
    case PaymentPolicy.PartialAdvance:
      return 'advance';
    case PaymentPolicy.DeliveryChargeOnly:
      return 'charge';
    case PaymentPolicy.FullPrepayment:
      return 'full';
    default:
      return 'cod';
  }
}

/** PRD-08's line, short: cash on delivery, the advance, the delivery charge first or the whole amount first. */
export function payTitle(product: PublicProduct, words: Words): string {
  const kind = payKindOf(product);
  if (kind === 'advance') {
    const advance = product.advanceAmount === null ? '0' : plainNumber(product.advanceAmount);
    return words.t('pay_adv', { n: advance });
  }
  if (kind === 'full') return words.t('pay_full');
  if (kind === 'charge') return words.t('pay_dc');
  return words.t('pay_cod');
}

/** The zones the shop delivers to, cheapest first: "Inside Dhaka city ৳70, Outside Dhaka ৳130". */
function zoneList(zones: readonly DeliveryZoneView[], words: Words, joiner: string): string {
  return zones
    .filter((zone) => !zone.noDelivery)
    .sort((a, b) => Number(a.charge) - Number(b.charge))
    .map((zone) => `${words.pick(zone.name)} ${money(zone.charge)}`)
    .join(joiner);
}

/** The delivery chip: two zones by name, more as the range they span. */
export function deliveryChipText(zones: readonly DeliveryZoneView[], words: Words): string | null {
  const open = zones.filter((zone) => !zone.noDelivery);
  if (open.length === 0) return null;
  if (open.length <= 2) return zoneList(open, words, ' · ');
  const range = deliveryRange(open);
  return range === null ? null : `${words.t('pp_t2l')} ${money(range.from)}–${money(range.to)}`;
}

/** Under the name: how it is paid, and what delivery costs. */
export function PayDeliveryChips({
  product,
  zones,
  words,
}: {
  product: PublicProduct;
  zones: readonly DeliveryZoneView[];
  words: Words;
}) {
  const delivery = deliveryChipText(zones, words);
  return (
    <div className="pp-chips">
      <span className="pp-chip ok">
        <Icon name="check" />
        {payTitle(product, words)}
      </span>
      {delivery ? (
        <span className="pp-chip">
          <Icon name="truck" />
          {delivery}
        </span>
      ) : null}
    </div>
  );
}

/** Three marks a shopper trusts: how it is paid, where it goes, and how quick the order is. "Nationwide" only when the
    shop delivers everywhere else (BL-10's fallback zone takes orders). */
export function TrustStrip({
  product,
  zones,
  words,
}: {
  product: PublicProduct;
  zones: readonly DeliveryZoneView[];
  words: Words;
}) {
  const kind = payKindOf(product);
  const [pay, payNote] =
    kind === 'cod'
      ? [words.t('pp_t1'), words.t('pp_t1s')]
      : kind === 'full'
        ? [words.t('pp_t1f'), words.t('pp_t1fs')]
        : [words.t('pp_t1a'), words.t('pp_t1as')];
  const everywhere = zones.some((zone) => zone.kind === 'fallback' && !zone.noDelivery);
  const range = deliveryRange(zones);
  const [where, whereNote] = everywhere
    ? [words.t('pp_t2'), words.t('pp_t2s')]
    : [
        words.t('pp_t2l'),
        range === null
          ? ''
          : range.from === range.to
            ? money(range.from)
            : `${money(range.from)}–${money(range.to)}`,
      ];
  return (
    <div className="pp-trust">
      <span>
        <Icon name="cash" />
        {pay}
        <small>{payNote}</small>
      </span>
      <span>
        <Icon name="truck" />
        {where}
        <small>{whereNote}</small>
      </span>
      <span>
        <Icon name="check" />
        {words.t('pp_t3')}
        <small>{words.t('pp_t3s')}</small>
      </span>
    </div>
  );
}

/** A page section with its heading, as the page's other sections have it. */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="sec pp-sec">
      <div className="sechead">
        <h2>{title}</h2>
      </div>
      {children}
    </section>
  );
}

/** The description, cut to a few lines with "Read the full description" when it runs longer. */
export function Description({ text, words }: { text: string; words: Words }) {
  const [open, setOpen] = useState(false);
  // About five lines on a phone; a shorter one shows whole, with no button.
  const long = text.length > 220 || text.split('\n').length > 5;
  return (
    <Section title={words.t('description')}>
      <div className={`pp-desc${long && !open ? ' cut' : ''}`}>{text}</div>
      {long ? (
        <button
          type="button"
          className="btn ghost block pp-more-btn"
          aria-expanded={open}
          onClick={() => {
            setOpen(!open);
          }}
        >
          {words.t(open ? 'pp_read_less' : 'pp_read_more')}
        </button>
      ) : null}
    </Section>
  );
}

/** The product's photos again, larger, two to a row: only when it has more than one. */
export function MorePhotos({ product, words }: { product: PublicProduct; words: Words }) {
  if (product.images.length < 2) return null;
  return (
    <Section title={words.t('pp_photos')}>
      <div className="pp-photos">
        {product.images.map((image) => (
          <img key={image.id} src={image.urls.main} alt={product.name} loading="lazy" />
        ))}
      </div>
    </Section>
  );
}

/** How ordering goes, in three steps; the last says how it is paid. */
export function HowItWorks({ product, words }: { product: PublicProduct; words: Words }) {
  const kind = payKindOf(product);
  const last =
    kind === 'cod' ? words.t('pp_s3') : kind === 'full' ? words.t('pp_s3f') : words.t('pp_s3a');
  return (
    <Section title={words.t('pp_how')}>
      <ol className="pp-steps">
        {[words.t('pp_s1'), words.t('pp_s2'), last].map((step, at) => (
          <li key={at}>
            <b>{at + 1}</b>
            {step}
          </li>
        ))}
      </ol>
    </Section>
  );
}

/** The questions a shopper asks before ordering, answered from the shop's own settings. */
export function Questions({
  product,
  zones,
  severalLines,
  words,
}: {
  product: PublicProduct;
  zones: readonly DeliveryZoneView[];
  /** Whether "Add another size or design" is offered, so the question about several has an answer. */
  severalLines: boolean;
  words: Words;
}) {
  const kind = payKindOf(product);
  const advance = product.advanceAmount === null ? '0' : plainNumber(product.advanceAmount);
  const list = zoneList(zones, words, ', ');
  const pay =
    kind === 'cod'
      ? words.t('pp_a2')
      : kind === 'advance'
        ? words.t('pp_a2a', { n: advance })
        : kind === 'charge'
          ? words.t('pp_a2d')
          : words.t('pp_a2f');
  const asked: [string, string][] = [
    ...(list === ''
      ? []
      : ([[words.t('pp_q1'), words.t('pp_a1', { list })]] as [string, string][])),
    [words.t('pp_q2'), pay],
    [words.t('pp_q3'), words.t('pp_a3')],
    ...(severalLines ? ([[words.t('pp_q4'), words.t('pp_a4')]] as [string, string][]) : []),
  ];
  return (
    <Section title={words.t('pp_faq')}>
      <div className="pp-faq">
        {asked.map(([question, answer]) => (
          <details key={question}>
            <summary>
              {question}
              <Icon name="down" />
            </summary>
            <p>{answer}</p>
          </details>
        ))}
      </div>
    </Section>
  );
}

/** The product's facts as one table, with a sentence a search engine reads: its price, the saving, its category, its
    options, its details, the shop, delivery and payment. */
export function Facts({
  product,
  variant,
  category,
  shopName,
  zones,
  words,
}: {
  product: PublicProduct;
  variant: ProductVariant | null;
  category: string | null;
  shopName: string;
  zones: readonly DeliveryZoneView[];
  words: Words;
}) {
  const price = variant?.price ?? product.minPrice;
  const regular = (variant ? variant.regularPrice : product.minRegularPrice) ?? null;
  const off = price !== null && regular !== null ? discountPercent(price, regular) : 0;
  const kind = payKindOf(product);
  const delivery = zoneList(zones, words, ', ');
  // PD-6: a design option's values are photos, never named to a shopper.
  const options = product.options.filter((option) => !option.designs);
  return (
    <Section title={words.t('pp_facts')}>
      {price !== null ? (
        <p className="pp-facts-p">
          {words.t('pp_facts_p', {
            p: product.name,
            n: money(price),
            s: shopName,
            pay: kind === 'cod' ? words.t('pp_f_cod') : payTitle(product, words),
          })}
        </p>
      ) : null}
      <div className="kv pp-facts">
        {price !== null ? (
          <>
            <span className="k">{words.t('pp_price')}</span>
            <span className="v">{money(price)}</span>
          </>
        ) : null}
        {off > 0 && regular !== null ? (
          <>
            <span className="k">{words.t('pp_regular')}</span>
            <span className="v">{words.t('pp_regular_v', { n: money(regular), p: off })}</span>
          </>
        ) : null}
        {category ? (
          <>
            <span className="k">{words.t('pp_category')}</span>
            <span className="v">{category}</span>
          </>
        ) : null}
        {options.map((option) => (
          <Fragment key={option.attributeId}>
            <span className="k">{option.name}</span>
            <span className="v">
              {option.values.map((value) => optionText(option, value.value, words)).join(', ')}
            </span>
          </Fragment>
        ))}
        <span className="k">{words.t('pp_shop')}</span>
        <span className="v">{shopName}</span>
        {delivery !== '' ? (
          <>
            <span className="k">{words.t('pp_dcharge')}</span>
            <span className="v">{delivery}</span>
          </>
        ) : null}
        <span className="k">{words.t('pp_payment')}</span>
        <span className="v">{payTitle(product, words)}</span>
      </div>
      {product.attributes.length > 0 ? (
        <div className="pp-facts">
          <DetailsList attributes={product.attributes} words={words} />
        </div>
      ) : null}
    </Section>
  );
}
