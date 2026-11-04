'use client';

import { PaymentPolicy } from '@lytronix/validators/enums';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  DeliveryEstimate,
  DeliveryZoneView,
  PlacedOrder,
  PublicProduct,
} from '@/lib/api/storefront-api';
import { totalWith } from '@/lib/cart/cart-check';
import { type CartLine, estimateItemOf, orderItemOf } from '@/lib/cart/cart-store';
import { type Language, money, plainNumber, Words } from '@/lib/i18n/words';
import { ADDRESS_MAX, lineQuantityText, NAME_MAX, NOTE_MAX } from '@/lib/order/order-form';
import { quantityRule } from '@/lib/product/quantity';
import { VariantChoice } from '@/lib/product/variant-choice';
import { Icon } from '../icon';
import { LineExtras, NoticeBanner, TaxRows } from '../order/order-parts';
import { PlacedView } from '../order/placed-view';
import { useOrderPlacing } from '../order/use-order-placing';
import {
  DetailsList,
  OptionRows,
  optionText,
  PayLine,
  PriceRow,
  Quantity,
  rangeText,
  LimitedLine,
} from '../product/buy-parts';
import { Gallery } from '../product/gallery';
import { AddOnGroups, AskedFields, ComboInside, usePicks } from '../product/pickers';
import { AreaFields, DeliveryBanner, SizeChartSheet, zillaOf } from '../product/sheets';
import { useLocations, useSettledEstimate } from '../product/use-delivery';
import { pixelEvent } from './pixel-events';

export interface LandingViewProps {
  language: Language;
  shopName: string;
  shopPhone: string | null;
  product: PublicProduct;
  zones: DeliveryZoneView[];
  linkedVariantId: string | null;
  areaId: number | null;
  initialEstimate: DeliveryEstimate | null;
}

/** LND-01, LND-06 to LND-12: the one-product page as the prototype draws it (landingPage, orderForm, landingBar): the
    product with its picker, and the order form beside it with the totals worked out as the shopper picks. The order is
    placed without leaving the page, and the same address then shows its confirmation. A product needing to be paid for
    first waits for Phase 5's payment step (`e48-landing-advance`). LND-15: InitiateCheckout at the form's first field,
    and Purchase once placed, under the ID the server tells Meta (LND-16). */
export function LandingView(props: LandingViewProps) {
  const { product } = props;
  const words = useMemo(() => new Words(props.language), [props.language]);
  const choice = useMemo(
    () => new VariantChoice(product.options, product.variants),
    [product.options, product.variants],
  );
  const [selection, setSelection] = useState(() => choice.initial(props.linkedVariantId));
  const [quantity, setQuantity] = useState(
    () => quantityRule(product.stockUnit, product.sharedStock).first,
  );
  const shownQuantity = lineQuantityText({ quantity, stockUnit: product.stockUnit }, words);
  const [zillaId, setZillaId] = useState<number | null>(null);
  const [sizeChart, setSizeChart] = useState(false);
  const [placed, setPlaced] = useState<PlacedOrder | null>(null);
  const form = useRef<HTMLDivElement>(null);
  const begun = useRef(false);
  const closeSizeChart = useCallback(() => {
    setSizeChart(false);
  }, []);
  const locations = useLocations(true);
  const placing = useOrderPlacing({ initialThana: props.areaId, source: 'landing_page' });
  const { fields, problems, notice } = placing;
  const picks = usePicks(product);

  const variant = choice.variantFor(selection);
  const soldOut = product.variants.every((each) => !each.available) || !picks.canBeMade;
  const choiceText = product.options
    .map((option) => {
      const value = option.values.find((each) => each.id === selection[option.attributeId]);
      return value ? optionText(option, value.value, words) : '';
    })
    .filter((text) => text !== '')
    .join(' · ');
  const thumbnail = product.images[0]?.urls.thumbnail ?? null;
  const line: CartLine | null = variant?.available
    ? {
        variantId: variant.id,
        productSlug: product.slug,
        name: product.name,
        choice: choiceText,
        price: variant.price,
        image: thumbnail,
        quantity,
        ...picks.lineFields,
      }
    : null;
  // Only what can be bought is priced: a sold-out choice keeps the last answer instead of reading as undeliverable.
  const answer = useSettledEstimate(
    props.initialEstimate,
    line ? [estimateItemOf(line)] : null,
    fields.thanaId,
  );
  const { estimate } = answer;
  const price = variant?.price ?? product.minPrice;
  const worked = price === null ? 0 : (Number(price) + picks.addOnsPrice) * quantity;
  // The server's own sum once it has answered for what is picked now (LND-08), the same sum until then.
  const asked = answer.settled ? estimate?.lines[0]?.itemTotal : null;
  const itemTotal = asked ? Number(asked) : worked;
  const thana = fields.thanaId;
  const exact =
    thana !== null && estimate?.deliverable === true && estimate.deliveryCharge !== null
      ? Number(estimate.deliveryCharge)
      : null;
  const range = thana === null ? (estimate?.range ?? null) : null;
  const undeliverable = thana !== null && estimate !== null && !estimate.deliverable;
  const total = totalWith(itemTotal, exact, range);
  const paysFirst = product.paymentPolicy !== PaymentPolicy.None;

  // LND-15: the purchase, with the same ID the server sends, so Meta counts it once (LND-16).
  useEffect(() => {
    if (!placed) return;
    const items = placed.items.flatMap((item) => (item.variantId === null ? [] : [item]));
    pixelEvent(
      'track',
      'Purchase',
      {
        content_ids: items.map((item) => item.variantId),
        content_type: 'product',
        currency: 'BDT',
        value: Number(placed.grandTotal),
        contents: items.map((item) => ({ id: item.variantId, quantity: Number(item.quantity) })),
      },
      { eventID: placed.purchaseEventId },
    );
  }, [placed]);

  if (placed) {
    return (
      <PlacedView
        language={props.language}
        orderNumber={placed.orderNumber}
        trackingId={placed.trackingId}
        codAmount={placed.codAmount}
        landing
      />
    );
  }

  /** LND-15: the shopper starts the form. */
  const begin = () => {
    if (begun.current) return;
    begun.current = true;
    pixelEvent('track', 'InitiateCheckout', {
      content_ids: variant ? [variant.id] : product.variants.map((each) => each.id),
      content_type: 'product',
      currency: 'BDT',
      value: itemTotal,
    });
  };

  const confirm = async () => {
    if (!line || !picks.ready()) return;
    const order = await placing.place([orderItemOf(line)]);
    if (order) setPlaced(order);
  };

  const canConfirm =
    line !== null && !soldOut && !paysFirst && !undeliverable && !placing.placing && answer.settled;
  const callShop = props.shopPhone ? (
    <a className="btn ghost sm" href={`tel:${props.shopPhone}`}>
      <Icon name="phone" /> {words.t('e48CallShop')}
    </a>
  ) : null;

  let banner = null;
  if (paysFirst && !soldOut) {
    banner = (
      <>
        <NoticeBanner
          tone="warn"
          title={
            product.paymentPolicy === PaymentPolicy.PartialAdvance && product.advanceAmount !== null
              ? words.t('adv_t_n', { p: product.name, n: plainNumber(product.advanceAmount) })
              : words.t('adv_t', { p: product.name })
          }
          text={words.t('e48AdvP')}
        />
        {callShop ? <div style={{ display: 'flex', gap: 8 }}>{callShop}</div> : null}
      </>
    );
  } else if (notice?.kind === 'sold_out') {
    banner = (
      <NoticeBanner
        tone="bad"
        title={words.t('short_t', { p: product.name })}
        text={words.t('e48ShortP')}
      />
    );
  } else if (notice?.kind === 'advance') {
    banner = <NoticeBanner tone="warn" title={words.t('e48FailT')} text={words.t('e48AdvP')} />;
  } else if (notice?.kind === 'busy') {
    banner = <NoticeBanner tone="warn" title={words.t('e48BusyT')} text={words.t('e48BusyP')} />;
  } else if (notice?.kind === 'failed' || notice?.kind === 'recheck') {
    banner = <NoticeBanner tone="bad" title={words.t('e48FailT')} text={words.t('e48FailP')} />;
  } else if (problems.length > 0) {
    banner = (
      <div className="banner bad" role="alert">
        <Icon name="warn" />
        <span>{words.t('err_fix', { n: problems.length })}</span>
      </div>
    );
  }

  return (
    <>
      <div className="pdp">
        <Gallery product={product} words={words} />
        <div className="buy">
          <div className="top">
            <div className="eyebrow">{props.shopName}</div>
            <h1 className="pt">{product.name}</h1>
            <PriceRow product={product} variant={variant} soldOut={soldOut} words={words} />
          </div>
          <OptionRows
            product={product}
            choice={choice}
            selection={selection}
            words={words}
            onPick={(attributeId, valueId) => {
              setSelection(choice.pick(selection, attributeId, valueId));
            }}
            sizeChartLink={
              product.sizeChart ? (
                <button
                  type="button"
                  className="lnk"
                  onClick={() => {
                    setSizeChart(true);
                  }}
                >
                  <Icon name="ruler" /> {words.t('size_chart')}
                </button>
              ) : null
            }
          />
          <ComboInside product={product} picks={picks} words={words} />
          {product.deliveryZoneIds.length > 0 ? (
            <LimitedLine product={product} zones={props.zones} words={words} />
          ) : null}
          {soldOut ? null : (
            <Quantity
              value={quantity}
              unit={product.stockUnit}
              sharedStock={product.sharedStock}
              words={words}
              onChange={setQuantity}
            />
          )}
          {soldOut ? null : (
            <>
              <AddOnGroups product={product} picks={picks} words={words} />
              <AskedFields product={product} picks={picks} words={words} />
            </>
          )}
          {product.description ? (
            <div className="desc" style={{ fontSize: 14, color: 'var(--muted)' }}>
              {product.description}
            </div>
          ) : null}
          {product.attributes.length > 0 ? (
            <div className="acc">
              <details>
                <summary>
                  {words.t('details')}
                  <Icon name="down" />
                </summary>
                <div className="body">
                  <DetailsList attributes={product.attributes} words={words} />
                </div>
              </details>
            </div>
          ) : null}
        </div>
      </div>

      <div className="two">
        <div
          className="ofrm"
          ref={form}
          style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
          onFocus={begin}
        >
          {banner}
          <div className="card2">
            <h3>{words.t('your_details')}</h3>
            <div className="field">
              <label htmlFor="order-name">{words.t('name')}</label>
              <input
                id="order-name"
                className={problems.includes('customerName') ? 'input bad' : 'input'}
                autoComplete="name"
                maxLength={NAME_MAX}
                placeholder={words.t('name_ph')}
                value={fields.customerName}
                onChange={(event) => {
                  placing.setField('customerName', event.target.value);
                }}
              />
              {problems.includes('customerName') ? (
                <div className="err">{words.t('err_name')}</div>
              ) : null}
            </div>
            <div className="field">
              <label htmlFor="order-phone">{words.t('phone_')}</label>
              <input
                id="order-phone"
                className={problems.includes('phone') ? 'input bad' : 'input'}
                inputMode="tel"
                autoComplete="tel-national"
                placeholder="01XXXXXXXXX"
                value={fields.phone}
                onChange={(event) => {
                  placing.setField('phone', event.target.value);
                }}
              />
              {problems.includes('phone') ? (
                <div className="err">{words.t('err_phone')}</div>
              ) : null}
            </div>
            <AreaFields
              locations={locations}
              zillaId={zillaId ?? zillaOf(locations, thana)}
              thanaId={thana}
              words={words}
              onZilla={(id) => {
                setZillaId(id);
                placing.setThana(null);
              }}
              onThana={placing.setThana}
              thanaError={problems.includes('locationId') ? words.t('err_thana') : null}
            />
            <div className="field">
              <label htmlFor="order-address">{words.t('address')}</label>
              <textarea
                id="order-address"
                className="textarea"
                autoComplete="street-address"
                maxLength={ADDRESS_MAX}
                placeholder={words.t('address_ph')}
                value={fields.deliveryAddress}
                onChange={(event) => {
                  placing.setField('deliveryAddress', event.target.value);
                }}
              />
              {problems.includes('deliveryAddress') ? (
                <div className="err">{words.t('err_addr')}</div>
              ) : null}
            </div>
            <div className="field">
              <label htmlFor="order-comments">{words.t('comments')}</label>
              <textarea
                id="order-comments"
                className="textarea"
                maxLength={NOTE_MAX}
                value={fields.shopperNote}
                onChange={(event) => {
                  placing.setField('shopperNote', event.target.value);
                }}
              />
            </div>
          </div>
        </div>
        <div className="side">
          <div className="card2">
            <h3>{words.t('co_summary')}</h3>
            <div className="cl">
              {thumbnail ? (
                <img className="th photo" src={thumbnail} alt="" />
              ) : (
                <span className="th">{Array.from(product.name.trim())[0]}</span>
              )}
              <div className="b">
                <div className="nm">{product.name}</div>
                <div className="vr">
                  {choiceText ? `${choiceText} × ${shownQuantity}` : `× ${shownQuantity}`}
                </div>
                <LineExtras
                  parts={picks.lineFields.partsText}
                  addOns={picks.lineFields.addOns?.map((row) => ({
                    name: row.name,
                    price: row.priceChange,
                  }))}
                  answers={picks.lineFields.answers}
                  words={words}
                />
              </div>
            </div>
            <div className="sum">
              <div className="r">
                <span className="k">{words.t('item_total')}</span>
                <span>{money(itemTotal)}</span>
              </div>
              <div className="r">
                <span className="k">
                  {words.t('delivery')}
                  {exact !== null && estimate?.zone ? ` · ${words.pick(estimate.zone.name)}` : ''}
                </span>
                <span>{exact !== null ? money(exact) : range ? rangeText(range, words) : '—'}</span>
              </div>
              <div className="r total">
                <span>{words.t('grand_total')}</span>
                <span className="price">
                  {total.from === total.to
                    ? money(total.from)
                    : `${money(total.from)} – ${money(total.to)}`}
                </span>
              </div>
              <TaxRows taxes={estimate?.taxes ?? []} words={words} />
            </div>
            {undeliverable ? (
              <DeliveryBanner estimate={estimate} words={words} shopPhone={props.shopPhone} />
            ) : null}
            <PayLine product={product} words={words} />
            {soldOut ? (
              <button type="button" className="btn ghost lg block" disabled>
                {words.t('out')}
              </button>
            ) : (
              <button
                type="button"
                className="btn primary lg block"
                disabled={!canConfirm}
                aria-busy={placing.placing}
                onClick={() => {
                  void confirm();
                }}
              >
                {words.t('confirm_order')}
              </button>
            )}
            <div className="sub" style={{ fontSize: 12, textAlign: 'center' }}>
              {words.t('idem_note')}
            </div>
          </div>
        </div>
      </div>

      <div className="buybar">
        <span className="tot">
          <span className="k">{product.name}</span>
          <span className="price">{price === null ? '' : money(price)}</span>
        </span>
        <button
          type="button"
          className="btn primary"
          onClick={() => {
            const target = form.current;
            const scroller = target?.closest('.scroll');
            if (target && scroller)
              scroller.scrollTo({ top: target.offsetTop - 72, behavior: 'smooth' });
          }}
        >
          {words.t('order_now')} <Icon name="down" />
        </button>
      </div>

      {sizeChart && product.sizeChart ? (
        <SizeChartSheet chart={product.sizeChart} words={words} onClose={closeSizeChart} />
      ) : null}
    </>
  );
}
