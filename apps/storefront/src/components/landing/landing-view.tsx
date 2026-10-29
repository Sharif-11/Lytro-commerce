'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import type { DeliveryEstimate, PublicProduct } from '@/lib/api/storefront-api';
import { type Language, money, Words } from '@/lib/i18n/words';
import { VariantChoice } from '@/lib/product/variant-choice';
import { Icon } from '../icon';
import {
  DetailsList,
  OptionRows,
  optionText,
  PayLine,
  PriceRow,
  Quantity,
  rangeText,
} from '../product/buy-parts';
import { Gallery } from '../product/gallery';
import { AreaFields, DeliveryBanner, SizeChartSheet, zillaOf } from '../product/sheets';
import { useDeliveryEstimate, useLocations } from '../product/use-delivery';

export interface LandingViewProps {
  language: Language;
  shopName: string;
  shopPhone: string | null;
  product: PublicProduct;
  linkedVariantId: string | null;
  areaId: number | null;
  initialEstimate: DeliveryEstimate | null;
}

/** LND-01, LND-06 to LND-08: the one-product page as the prototype draws it (landingPage, orderForm, landingBar): the
    product with its picker, and the order form beside it with the totals worked out as the shopper picks. The form is
    laid out but not sent until Phase 4 (agreed 2026-10-29), which one line says. */
export function LandingView(props: LandingViewProps) {
  const { product } = props;
  const words = useMemo(() => new Words(props.language), [props.language]);
  const choice = useMemo(
    () => new VariantChoice(product.options, product.variants),
    [product.options, product.variants],
  );
  const [selection, setSelection] = useState(() => choice.initial(props.linkedVariantId));
  const [quantity, setQuantity] = useState(1);
  const [zillaId, setZillaId] = useState<number | null>(null);
  const [thanaId, setThanaId] = useState<number | null>(props.areaId);
  const [sizeChart, setSizeChart] = useState(false);
  const form = useRef<HTMLDivElement>(null);
  const closeSizeChart = useCallback(() => {
    setSizeChart(false);
  }, []);
  const locations = useLocations(true);

  const variant = choice.variantFor(selection);
  const soldOut = product.variants.every((each) => !each.available);
  // Only what can be bought is priced: a sold-out choice keeps the last answer instead of reading as undeliverable.
  const items = variant?.available ? [{ variantId: variant.id, quantity }] : null;
  const estimate = useDeliveryEstimate(props.initialEstimate, items, thanaId);
  const price = variant?.price ?? product.minPrice;
  const itemTotal = price === null ? 0 : Number(price) * quantity;
  const exact =
    thanaId !== null && estimate?.deliverable === true && estimate.deliveryCharge !== null
      ? Number(estimate.deliveryCharge)
      : null;
  const choiceText = product.options
    .map((option) => {
      const value = option.values.find((each) => each.id === selection[option.attributeId]);
      return value ? optionText(option, value.value, words) : '';
    })
    .filter((text) => text !== '')
    .join(' · ');
  const thumbnail = product.images[0]?.urls.thumbnail ?? null;

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
          {soldOut ? null : <Quantity value={quantity} words={words} onChange={setQuantity} />}
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
        >
          <div className="banner info">
            <Icon name="info" />
            <span>{words.t('landing_soon')}</span>
          </div>
          <div className="card2">
            <h3>{words.t('your_details')}</h3>
            <div className="field">
              <label htmlFor="order-name">{words.t('name')}</label>
              <input id="order-name" className="input" autoComplete="name" />
            </div>
            <div className="field">
              <label htmlFor="order-phone">{words.t('phone_')}</label>
              <input
                id="order-phone"
                className="input"
                inputMode="tel"
                autoComplete="tel-national"
                placeholder="01XXXXXXXXX"
              />
            </div>
            <AreaFields
              locations={locations}
              zillaId={zillaId ?? zillaOf(locations, thanaId)}
              thanaId={thanaId}
              words={words}
              onZilla={(id) => {
                setZillaId(id);
                setThanaId(null);
              }}
              onThana={setThanaId}
            />
            <div className="field">
              <label htmlFor="order-address">{words.t('address')}</label>
              <textarea
                id="order-address"
                className="textarea"
                autoComplete="street-address"
                placeholder={words.t('address_ph')}
              />
            </div>
            <div className="field">
              <label htmlFor="order-comments">{words.t('comments')}</label>
              <textarea id="order-comments" className="textarea" />
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
                  {choiceText ? `${choiceText} × ${String(quantity)}` : `× ${String(quantity)}`}
                </div>
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
                <span>
                  {exact !== null
                    ? money(exact)
                    : estimate?.range && thanaId === null
                      ? rangeText(estimate.range, words)
                      : '—'}
                </span>
              </div>
              <div className="r total">
                <span>{words.t('grand_total')}</span>
                <span className="price">
                  {exact !== null
                    ? money(itemTotal + exact)
                    : estimate?.range && thanaId === null
                      ? `${money(itemTotal + Number(estimate.range.from))} – ${money(itemTotal + Number(estimate.range.to))}`
                      : money(itemTotal)}
                </span>
              </div>
            </div>
            {thanaId !== null && estimate && !estimate.deliverable ? (
              <DeliveryBanner estimate={estimate} words={words} shopPhone={props.shopPhone} />
            ) : null}
            <PayLine product={product} words={words} />
            <button type="button" className="btn primary lg block" disabled>
              {words.t('confirm_order')}
            </button>
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
