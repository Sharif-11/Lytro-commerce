'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DeliveryEstimate, DeliveryZoneView, PublicProduct } from '@/lib/api/storefront-api';
import { areaCookieValue } from '@/lib/area';
import { browserCart, CART_OPEN } from '@/lib/cart/cart-store';
import { type Language, money, Words } from '@/lib/i18n/words';
import { VariantChoice } from '@/lib/product/variant-choice';
import { Icon } from '../icon';
import {
  DeliveryLine,
  DetailsList,
  LimitedLine,
  OptionRows,
  optionText,
  PayLine,
  PriceRow,
  Quantity,
} from './buy-parts';
import { Gallery } from './gallery';
import { AreaSheet, DeliveryBanner, ShareLinks, ShareSheet, SizeChartSheet } from './sheets';
import { useDeliveryEstimate } from './use-delivery';

export interface ProductViewProps {
  language: Language;
  product: PublicProduct;
  /** The product's primary category, the eyebrow over its name. */
  category: string | null;
  zones: DeliveryZoneView[];
  shopPhone: string | null;
  linkedVariantId: string | null;
  areaId: number | null;
  initialEstimate: DeliveryEstimate | null;
  shareUrl: string;
}

type OpenSheet = 'size' | 'area' | 'share' | null;

/** SFT-04, SFT-05, SFT-20: the product page as the prototype draws it (productPage, buyBox, buybar): the gallery, the
    variant picker with each variant's own price and stock, the delivery charge, and adding to the cart. */
export function ProductView(props: ProductViewProps) {
  const { product, zones, shopPhone } = props;
  const words = useMemo(() => new Words(props.language), [props.language]);
  const choice = useMemo(
    () => new VariantChoice(product.options, product.variants),
    [product.options, product.variants],
  );
  const [selection, setSelection] = useState(() => choice.initial(props.linkedVariantId));
  const [quantity, setQuantity] = useState(1);
  const [areaId, setAreaId] = useState(props.areaId);
  const [sheet, setSheet] = useState<OpenSheet>(null);
  const [toast, setToast] = useState(false);
  const closeSheet = useCallback(() => {
    setSheet(null);
  }, []);

  const variant = choice.variantFor(selection);
  const soldOut = product.variants.every((each) => !each.available);
  const unavailable = !soldOut && (variant === null || !variant.available);
  // Only what can be bought is priced: a sold-out choice keeps the last answer instead of reading as undeliverable.
  const items = variant?.available ? [{ variantId: variant.id, quantity }] : null;
  const estimate = useDeliveryEstimate(props.initialEstimate, items, areaId);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => {
      setToast(false);
    }, 2500);
    return () => {
      clearTimeout(timer);
    };
  }, [toast]);

  const addToCart = () => {
    if (!variant || unavailable || soldOut) return;
    const choiceText = product.options
      .map((option) => {
        const value = option.values.find((each) => each.id === selection[option.attributeId]);
        return value ? optionText(option, value.value, words) : '';
      })
      .filter((text) => text !== '')
      .join(' · ');
    const added = browserCart().add({
      variantId: variant.id,
      productSlug: product.slug,
      name: product.name,
      choice: choiceText,
      price: variant.price,
      image: product.images[0]?.urls.thumbnail ?? null,
      quantity,
    });
    if (added) setToast(true);
  };

  const sizeChartLink = product.sizeChart ? (
    <button
      type="button"
      className="lnk"
      onClick={() => {
        setSheet('size');
      }}
    >
      <Icon name="ruler" /> {words.t('size_chart')}
    </button>
  ) : null;
  const price = variant?.price ?? product.minPrice;
  const total = price === null ? null : Number(price) * quantity;
  const areaSet = areaId !== null;

  return (
    <>
      <div className="pdp">
        <Gallery product={product} words={words} />
        <div className="buy">
          <div className="top">
            {props.category ? <div className="eyebrow">{props.category}</div> : null}
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
            sizeChartLink={sizeChartLink}
          />
          {unavailable ? (
            <div className="banner warn">
              <Icon name="warn" />
              <span>
                <b>{words.t('unavailable')}</b>
                <br />
                {words.t('unavailable_hint')}
              </span>
            </div>
          ) : null}
          {soldOut ? null : <Quantity value={quantity} words={words} onChange={setQuantity} />}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <DeliveryLine
              estimate={estimate}
              areaSet={areaSet}
              words={words}
              onArea={() => {
                setSheet('area');
              }}
            />
            <PayLine product={product} words={words} />
            <LimitedLine product={product} zones={zones} words={words} />
          </div>
          {areaSet && estimate && !estimate.deliverable ? (
            <DeliveryBanner estimate={estimate} words={words} shopPhone={shopPhone} />
          ) : null}
          <div className="dbtns">
            {soldOut ? (
              <button type="button" className="btn ghost lg" disabled>
                {words.t('out')}
              </button>
            ) : unavailable ? (
              <button type="button" className="btn primary lg" disabled>
                {words.t('add')}
              </button>
            ) : (
              <>
                <button type="button" className="btn ghost lg" onClick={addToCart}>
                  {words.t('add')}
                </button>
                <button type="button" className="btn primary lg" disabled>
                  {words.t('buy_now')}
                </button>
              </>
            )}
          </div>
          {soldOut || unavailable ? null : <p className="sub soon">{words.t('landing_soon')}</p>}
          <div className="acc">
            {product.description ? (
              <details open>
                <summary>
                  {words.t('description')}
                  <Icon name="down" />
                </summary>
                <div className="body desc">{product.description}</div>
              </details>
            ) : null}
            {product.attributes.length > 0 ? (
              <details>
                <summary>
                  {words.t('details')}
                  <Icon name="down" />
                </summary>
                <div className="body">
                  <DetailsList attributes={product.attributes} words={words} />
                </div>
              </details>
            ) : null}
          </div>
          <div className="share">
            <button
              type="button"
              className="btn ghost sm"
              onClick={() => {
                setSheet('share');
              }}
            >
              <Icon name="share" />
              {words.t('share')}
            </button>
            <ShareLinks url={props.shareUrl} words={words} small />
          </div>
        </div>
      </div>

      <div className="buybar">
        <span className="tot">
          <span className="k">{soldOut ? words.t('out') : words.t('total')}</span>
          <span className="price">{total === null ? '' : money(total)}</span>
        </span>
        {soldOut ? (
          <button type="button" className="btn ghost" disabled>
            {words.t('out')}
          </button>
        ) : unavailable ? (
          <button type="button" className="btn primary" disabled>
            {words.t('add')}
          </button>
        ) : (
          <>
            <button
              type="button"
              className="btn ghost"
              aria-label={words.t('add')}
              onClick={addToCart}
            >
              <Icon name="bag" />
            </button>
            <button type="button" className="btn primary" onClick={addToCart}>
              {words.t('add')}
            </button>
          </>
        )}
      </div>

      {toast ? (
        <div className="toast" role="status">
          <Icon name="check" />
          <span>{words.t('added')}</span>
          <button
            type="button"
            className="btn"
            onClick={() => {
              setToast(false);
              window.dispatchEvent(new Event(CART_OPEN));
            }}
          >
            {words.t('view_cart')}
          </button>
        </div>
      ) : null}
      {sheet === 'size' && product.sizeChart ? (
        <SizeChartSheet chart={product.sizeChart} words={words} onClose={closeSheet} />
      ) : null}
      {sheet === 'share' ? (
        <ShareSheet url={props.shareUrl} words={words} onClose={closeSheet} />
      ) : null}
      {sheet === 'area' ? (
        <AreaSheet
          words={words}
          items={items}
          areaId={areaId}
          shopPhone={shopPhone}
          onClose={closeSheet}
          onSave={(thanaId) => {
            document.cookie = areaCookieValue(thanaId);
            setAreaId(thanaId);
            setSheet(null);
          }}
        />
      ) : null}
    </>
  );
}
