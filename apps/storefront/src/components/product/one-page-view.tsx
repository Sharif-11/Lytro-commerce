'use client';

import { discountPercent } from '@lytronix/validators/common';
import { type PaymentMethod, PaymentPolicy } from '@lytronix/validators/enums';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  DeliveryEstimate,
  DeliveryZoneView,
  PlacedOrder,
  PublicProduct,
  ShopperPaymentMethod,
} from '@/lib/api/storefront-api';
import { totalWith } from '@/lib/cart/cart-check';
import {
  browserCart,
  CART_OPEN,
  type CartLine,
  estimateItemOf,
  orderItemOf,
} from '@/lib/cart/cart-store';
import { type Language, money, plainNumber, Words } from '@/lib/i18n/words';
import { ADDRESS_MAX, lineQuantityText, NAME_MAX, NOTE_MAX } from '@/lib/order/order-form';
import { lineImageOf, withDesign } from '@/lib/product/designs';
import { quantityRule } from '@/lib/product/quantity';
import { type Selection, VariantChoice } from '@/lib/product/variant-choice';
import type { ShopChat } from '@/lib/shop/shop-chat';
import { pixelEvent } from '../landing/pixel-events';
import { Icon } from '../icon';
import { OrdersPausedBanner } from '../shell';
import { LineExtras, NoticeBanner, TaxRows } from '../order/order-parts';
import { AdvanceRows, PayChooser, PayNextHint } from '../order/pay-chooser';
import { PlacedView } from '../order/placed-view';
import { useOrderPlacing } from '../order/use-order-placing';
import {
  DeliveryLine,
  LimitedLine,
  OptionRows,
  optionText,
  PhotoCards,
  PriceRow,
  Quantity,
} from './buy-parts';
import { Gallery } from './gallery';
import {
  Description,
  Facts,
  HowItWorks,
  MorePhotos,
  PayDeliveryChips,
  payKindOf,
  payTitle,
  Questions,
  TrustStrip,
} from './one-page-parts';
import { AddOnGroups, AskedFields, ComboInside, usePicks } from './pickers';
import {
  AreaFields,
  DeliveryBanner,
  ShareLinks,
  ShareSheet,
  SizeChartSheet,
  zillaOf,
} from './sheets';
import { type BrowserOpening, useBrowserOpening } from './use-browser-opening';
import { useDesignChoice } from './use-design-choice';
import { useLocations, useSettledEstimate } from './use-delivery';

export interface OnePageViewProps {
  language: Language;
  shopName: string;
  shopPhone: string | null;
  product: PublicProduct;
  /** The product's primary category, as the chip over its name; its page when the storefront shows it. */
  category: { name: string; href: string | null } | null;
  zones: DeliveryZoneView[];
  /** SFT-21: the shop's WhatsApp and Messenger, beside Add to cart; a pay-as-you-go shop has neither (PF-15). */
  chat: ShopChat;
  linkedVariantId: string | null;
  /** DC-3: the design a design card's link names; null for none. */
  linkedDesignId?: string | null;
  areaId: number | null;
  initialEstimate: DeliveryEstimate | null;
  /** Slice 9.10: a page Cloudflare's edge keeps; the browser applies the `?v=` link and the area after the first paint. */
  openInBrowser?: boolean;
  /** WAL-06, SFT-10: how this shop can be paid first; asked for only when the product needs it. */
  methods: ShopperPaymentMethod[];
  /** LND-09: where the order came from -- the product page, or a landing link (`/l/`) the shop shared. */
  source: 'storefront' | 'landing_page';
  /** SFT-16: with the storefront off, a landing link shows only this product -- no cart, no way into the shop. */
  storefrontOn: boolean;
  shareUrl: string;
}

/** One more size or design, in the same order (the owner's "add another"). */
interface ExtraLine {
  key: number;
  selection: Selection;
  quantity: number;
}

/** The words a line's buyer reads for what was picked; PD-6: never a design's name, which its photo shows instead. */
function choiceTextOf(product: PublicProduct, selection: Selection, words: Words): string {
  return product.options
    .filter((option) => !option.designs)
    .map((option) => {
      const value = option.values.find((each) => each.id === selection[option.attributeId]);
      return value ? optionText(option, value.value, words) : '';
    })
    .filter((text) => text !== '')
    .join(' · ');
}

/**
 * The one product page (the owner, 2026-11-24; the builder sketch's `pp-page`): the product and its order form on one
 * page, at /p/ and at the landing links (/l/) alike, in the shop's own frame with its header and categories. Lytro's
 * product page -- the gallery, the choices, Add to cart, sharing -- with the landing page's form (LND-06 to LND-12) under
 * the choices, and Bonik's best parts after it: the saving, another size or design in the same order, the trust strip,
 * the description cut short, more photos, how ordering works, the questions and the product's facts. LND-15's pixel
 * events fire where the shop's pixel is loaded (the landing links).
 */
export function OnePageView(props: OnePageViewProps) {
  const { product } = props;
  const words = useMemo(() => new Words(props.language), [props.language]);
  const choice = useMemo(
    () => new VariantChoice(product.options, product.variants),
    [product.options, product.variants],
  );
  const [selection, setSelection] = useState(() =>
    withDesign(product, choice.opening(props.linkedVariantId), props.linkedDesignId),
  );
  const designs = useDesignChoice(product, selection);
  const rule = quantityRule(product.stockUnit, product.sharedStock);
  const [quantity, setQuantity] = useState(() => rule.first);
  const [extras, setExtras] = useState<ExtraLine[]>([]);
  const nextKey = useRef(1);
  const [zillaId, setZillaId] = useState<number | null>(null);
  const [sheet, setSheet] = useState<'size' | 'share' | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [toast, setToast] = useState(false);
  const [placed, setPlaced] = useState<PlacedOrder | null>(null);
  const form = useRef<HTMLDivElement>(null);
  const begun = useRef(false);
  const closeSheet = useCallback(() => {
    setSheet(null);
  }, []);
  const locations = useLocations(true);
  const placing = useOrderPlacing({ initialThana: props.areaId, source: props.source });
  const { fields, problems, notice } = placing;
  const picks = usePicks(product);

  const variant = choice.variantFor(selection);
  const soldOut = product.variants.every((each) => !each.available) || !picks.canBeMade;
  const unavailable = !soldOut && !designs.needed && (variant === null || !variant.available);
  // "Add another": a product with choices to make and nothing more asked of each one (no combo, add-ons or questions).
  const severalLines =
    !soldOut &&
    product.options.length > 0 &&
    product.combo === null &&
    product.modifierGroups.length === 0 &&
    product.asked.length === 0;
  const lineOf = (lineSelection: Selection, lineQuantity: number): CartLine | null => {
    const picked = choice.variantFor(lineSelection);
    if (!picked?.available) return null;
    return {
      variantId: picked.id,
      productSlug: product.slug,
      name: product.name,
      choice: choiceTextOf(product, lineSelection, words),
      price: picked.price,
      image: lineImageOf(product, picked),
      quantity: lineQuantity,
      stockUnit: product.stockUnit,
      sharedStock: product.sharedStock,
    };
  };
  const first = variant?.available ? lineOf(selection, quantity) : null;
  const main: CartLine | null = first ? { ...first, ...picks.lineFields } : null;
  const more = extras.map((extra) => ({ extra, line: lineOf(extra.selection, extra.quantity) }));
  const lines = main ? [main, ...more.flatMap(({ line }) => (line ? [line] : []))] : [];
  const extrasReady = more.every(({ line }) => line !== null);

  // Only what can be bought is priced: a sold-out choice keeps the last answer instead of reading as undeliverable.
  const answer = useSettledEstimate(
    props.initialEstimate,
    lines.length > 0 ? lines.map(estimateItemOf) : null,
    fields.thanaId,
    product.id,
  );
  const { estimate } = answer;
  const { setThana } = placing;
  const { openOn } = designs;
  useBrowserOpening(
    props.openInBrowser === true,
    useCallback(
      (opening: BrowserOpening) => {
        if (opening.linkedVariantId !== null || opening.linkedDesignId !== null) {
          const linked = withDesign(
            product,
            choice.opening(opening.linkedVariantId),
            opening.linkedDesignId,
          );
          setSelection(linked);
          openOn(linked);
        }
        if (opening.areaId !== null) setThana(opening.areaId);
      },
      [choice, openOn, product, setThana],
    ),
  );

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => {
      setToast(false);
    }, 2500);
    return () => {
      clearTimeout(timer);
    };
  }, [toast]);

  const price = variant?.price ?? product.minPrice;
  const worked = lines.reduce(
    (sum, line, at) =>
      sum + (Number(line.price) + (at === 0 ? picks.addOnsPrice : 0)) * line.quantity,
    0,
  );
  // The server's own sum once it has answered for what is picked now (LND-08), the same sum until then.
  const asked =
    answer.settled && estimate && estimate.lines.length === lines.length
      ? estimate.lines.reduce((sum, line) => sum + Number(line.itemTotal), 0)
      : null;
  const itemTotal = asked ?? worked;
  const thana = fields.thanaId;
  const exact =
    thana !== null && estimate?.deliverable === true && estimate.deliveryCharge !== null
      ? Number(estimate.deliveryCharge)
      : null;
  const range = thana === null ? (estimate?.range ?? null) : null;
  const undeliverable = thana !== null && estimate !== null && !estimate.deliverable;
  const total = totalWith(itemTotal, exact, range);
  // PD-25: before the thana is known, the shop's highest charge and one total, never a range.
  const highest = range === null ? null : Number(range.to);
  const shownTotal = itemTotal + (exact ?? highest ?? 0);
  const paysFirst = product.paymentPolicy !== PaymentPolicy.None;
  const paying = paysFirst && props.methods.length > 0;
  const [method, setMethod] = useState<PaymentMethod | null>(props.methods[0]?.method ?? null);
  const advance = paying && estimate?.advance ? Number(estimate.advance) : null;

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
        items={placed.items}
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

  /** Before a design is chosen, the photos to choose from (PD-4); otherwise whether what is picked can be had. */
  const readyToBuy = (): boolean => {
    if (designs.needed) {
      designs.nudge();
      return false;
    }
    return main !== null && extrasReady && picks.ready();
  };

  const confirm = async () => {
    if (!readyToBuy()) return;
    const order = await placing.place(
      lines.map(orderItemOf),
      paying && method !== null ? { method } : undefined,
    );
    if (!order) return;
    // SFT-07, LND-10: an advance goes straight to the payment page.
    if (order.payment) window.location.assign(order.payment.paymentUrl);
    else setPlaced(order);
  };

  const addToCart = () => {
    if (!readyToBuy()) return;
    const cart = browserCart();
    if (lines.every((line) => cart.add(line))) setToast(true);
  };

  const scrollToForm = () => {
    // PD-4: before a photo is tapped, Order shows the photos to choose from.
    if (designs.needed) {
      designs.nudge();
      return;
    }
    const target = form.current;
    const scroller = target?.closest('.scroll');
    if (target && scroller) scroller.scrollTo({ top: target.offsetTop - 72, behavior: 'smooth' });
    else target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const canConfirm =
    (main !== null || designs.needed) &&
    extrasReady &&
    !soldOut &&
    (!paysFirst || (paying && method !== null)) &&
    !undeliverable &&
    !placing.placing &&
    answer.settled;
  const callShop = props.shopPhone ? (
    <a className="btn ghost sm" href={`tel:${props.shopPhone}`}>
      <Icon name="phone" /> {words.t('e48CallShop')}
    </a>
  ) : null;

  let banner = null;
  if (paysFirst && !paying && !soldOut) {
    banner = (
      <>
        <NoticeBanner
          tone="warn"
          title={words.t('pay58NoneT')}
          text={
            product.paymentPolicy === PaymentPolicy.PartialAdvance && product.advanceAmount !== null
              ? words.t('pay58NoneOne', { p: product.name, n: plainNumber(product.advanceAmount) })
              : words.t('pay58NoneOneAny', { p: product.name })
          }
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
    banner = (
      <NoticeBanner tone="warn" title={words.t('e48FailT')} text={words.t('pay58MethodGone')} />
    );
  } else if (notice?.kind === 'no_method' || notice?.kind === 'cap') {
    banner = (
      <>
        <NoticeBanner
          tone="warn"
          title={words.t(notice.kind === 'cap' ? 'pay58CapT' : 'pay58NoneT')}
          text={words.t(notice.kind === 'cap' ? 'pay58CapP' : 'pay58NoneLate')}
        />
        {callShop ? <div style={{ display: 'flex', gap: 8 }}>{callShop}</div> : null}
      </>
    );
  } else if (notice?.kind === 'busy') {
    banner = <NoticeBanner tone="warn" title={words.t('e48BusyT')} text={words.t('e48BusyP')} />;
  } else if (notice?.kind === 'paused') {
    // D9-14 (Slice 9.9): the order was refused because orders can't be saved for a few minutes; trying again later works.
    banner = <OrdersPausedBanner words={words} role="alert" />;
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
  const regularPrice = (variant ? variant.regularPrice : product.minRegularPrice) ?? null;
  const shownRegular =
    price !== null && regularPrice !== null && Number(regularPrice) > Number(price)
      ? regularPrice
      : null;
  // SB-21: the saving rounded down, as every card says it; a combo's own saving stays in its price row.
  const off =
    shownRegular !== null && price !== null && product.combo === null
      ? discountPercent(price, shownRegular)
      : 0;
  const pay = payTitle(product, words);
  const cod = payKindOf(product) === 'cod';
  const whatsapp = props.chat.whatsapp;
  const messenger = props.chat.messenger;
  const sideButtons = [
    props.storefrontOn ? (
      <button key="cart" type="button" className="btn ghost" onClick={addToCart}>
        {words.t('add')}
      </button>
    ) : null,
    whatsapp ? (
      <a
        key="wa"
        className="btn ghost pp-wa"
        href={whatsapp.href}
        target="_blank"
        rel="noopener noreferrer"
      >
        <Icon name="wa" />
        {words.t('whatsapp')}
      </a>
    ) : null,
    messenger ? (
      <a
        key="ms"
        className="btn ghost"
        href={messenger.href}
        target="_blank"
        rel="noopener noreferrer"
      >
        <Icon name="msgr" />
        {words.t('messenger')}
      </a>
    ) : null,
  ].filter((button) => button !== null);

  return (
    <>
      <div className="pdp pp">
        <Gallery
          product={product}
          words={words}
          index={designs.photoAt}
          onIndex={designs.setPhotoAt}
          badge={off > 0 ? `−${String(off)}%` : null}
        />
        <div className="buy">
          <div className="top">
            {props.category ? (
              props.category.href ? (
                <a className="pp-cat" href={props.category.href}>
                  {props.category.name}
                </a>
              ) : (
                <span className="pp-cat">{props.category.name}</span>
              )
            ) : null}
            <h1 className="pt">{product.name}</h1>
            <PriceRow
              product={product}
              variant={variant}
              soldOut={soldOut}
              words={words}
              takaSaving
            />
            <PayDeliveryChips product={product} zones={props.zones} words={words} />
          </div>
          {answer.busy ? (
            // Slice 9.10 (`p910-busy-delivery`): a charge the server was too busy to work out says so, with Try again.
            <DeliveryLine
              estimate={estimate}
              areaSet={thana !== null}
              words={words}
              onArea={scrollToForm}
              busy={{ onRetry: answer.retry }}
            />
          ) : null}
          <PhotoCards
            product={product}
            cards={designs.cards}
            designId={designs.designId}
            tapped={designs.tapped}
            nudge={designs.nudging}
            words={words}
            cardsRef={designs.cardsRef}
            onTap={(card) => {
              setSelection(designs.tap(card, selection));
            }}
          />
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
          {extras.map((extra) => (
            <ExtraLineBox
              key={extra.key}
              product={product}
              choice={choice}
              extra={extra}
              line={more.find((each) => each.extra.key === extra.key)?.line ?? null}
              words={words}
              onChange={(next) => {
                setExtras((all) => all.map((each) => (each.key === next.key ? next : each)));
              }}
              onRemove={() => {
                setExtras((all) => all.filter((each) => each.key !== extra.key));
              }}
            />
          ))}
          {severalLines ? (
            <button
              type="button"
              className="pp-another"
              onClick={() => {
                setExtras((all) => [
                  ...all,
                  { key: nextKey.current++, selection: choice.opening(null), quantity: rule.first },
                ]);
              }}
            >
              <Icon name="plus" />
              {words.t('pp_another')}
            </button>
          ) : null}
        </div>
      </div>

      {soldOut ? null : (
        <div className="two pp-form">
          <div className="ofrm" ref={form} onFocus={begin}>
            <div className="pp-fh">
              <h2>{words.t('pp_form_t')}</h2>
              <p>{words.t(cod ? 'pp_form_s' : 'pp_form_s_adv')}</p>
            </div>
            {banner}
            <div className="card2">
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
                <div className="pp-phone">
                  <span aria-hidden="true">+88</span>
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
                </div>
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
              {noteOpen || fields.shopperNote !== '' ? (
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
              ) : (
                <button
                  type="button"
                  className="lnk pp-note"
                  onClick={() => {
                    setNoteOpen(true);
                  }}
                >
                  {words.t('pp_note')}
                </button>
              )}
            </div>
          </div>
          <div className="side">
            <div className="card2">
              <h3>{words.t('co_summary')}</h3>
              {lines.map((line, at) => (
                <div className="cl" key={at}>
                  {line.image ? (
                    <img className="th photo" src={line.image} alt="" />
                  ) : (
                    <span className="th">{Array.from(product.name.trim())[0]}</span>
                  )}
                  <div className="b">
                    <div className="nm">{product.name}</div>
                    <div className="vr">
                      {line.choice
                        ? `${line.choice} × ${lineQuantityText(line, words)}`
                        : `× ${lineQuantityText(line, words)}`}
                    </div>
                    {at === 0 ? (
                      <LineExtras
                        parts={picks.lineFields.partsText}
                        addOns={picks.lineFields.addOns?.map((row) => ({
                          name: row.name,
                          price: row.priceChange,
                        }))}
                        answers={picks.lineFields.answers}
                        words={words}
                      />
                    ) : null}
                  </div>
                </div>
              ))}
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
                    {exact !== null ? money(exact) : highest !== null ? money(highest) : '—'}
                  </span>
                </div>
                {highest !== null ? (
                  <div className="r" style={{ fontSize: 13, color: 'var(--muted)' }}>
                    <span>{words.t('deliv_exact_thana')}</span>
                  </div>
                ) : null}
                <div className="r total">
                  <span>{words.t('grand_total')}</span>
                  <span className="price">{money(shownTotal)}</span>
                </div>
                <TaxRows taxes={estimate?.taxes ?? []} words={words} />
                {paying ? (
                  <AdvanceRows
                    advance={advance}
                    total={total.from === total.to ? total.from : null}
                    words={words}
                  />
                ) : null}
              </div>
              {undeliverable ? (
                <DeliveryBanner estimate={estimate} words={words} shopPhone={props.shopPhone} />
              ) : null}
              {paying ? (
                <PayChooser
                  methods={props.methods}
                  chosen={method}
                  advance={advance}
                  words={words}
                  onChoose={setMethod}
                />
              ) : null}
              <button
                type="button"
                className="btn primary lg block pp-cta"
                disabled={!canConfirm}
                aria-busy={placing.placing}
                onClick={() => {
                  void confirm();
                }}
              >
                {!paying
                  ? words.t('confirm_order')
                  : advance === null
                    ? words.t('pay58PlaceAny')
                    : words.t('place_adv', { n: plainNumber(advance) })}
                {!paying && cod ? (
                  <small>{words.t('pp_pay_arrive', { n: money(shownTotal) })}</small>
                ) : null}
              </button>
              {paying ? <PayNextHint words={words} /> : null}
              <div className="pp-track">
                <Icon name="check" />
                {words.t('pp_track')}
              </div>
              {sideButtons.length > 0 ? (
                <div className={sideButtons.length > 1 ? 'pp-alt' : 'pp-alt one'}>
                  {sideButtons}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}

      <TrustStrip product={product} zones={props.zones} words={words} />
      {product.description ? <Description text={product.description} words={words} /> : null}
      <div className="pp-share">
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
      <MorePhotos product={product} words={words} />
      <HowItWorks product={product} words={words} />
      {soldOut ? null : (
        <Questions
          product={product}
          zones={props.zones}
          severalLines={severalLines}
          words={words}
        />
      )}
      <Facts
        product={product}
        variant={variant}
        category={props.category?.name ?? null}
        shopName={props.shopName}
        zones={props.zones}
        words={words}
      />

      {soldOut ? null : (
        <div className="buybar pp-bar">
          <span className="tot">
            {/* The line as picked: its price with any add-ons, times the quantity (a half kg reads half the price). */}
            <span className="price">
              {price === null ? '' : money((Number(price) + picks.addOnsPrice) * quantity)}
              {shownRegular ? (
                <s>{money((Number(shownRegular) + picks.addOnsPrice) * quantity)}</s>
              ) : null}
            </span>
            <span className="k">{pay}</span>
          </span>
          <button type="button" className="btn primary" onClick={scrollToForm}>
            {words.t('order_now')}
          </button>
        </div>
      )}

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
    </>
  );
}

/** One more size or design: its own photos to choose from, its options, its quantity, and Remove. */
function ExtraLineBox({
  product,
  choice,
  extra,
  line,
  words,
  onChange,
  onRemove,
}: {
  product: PublicProduct;
  choice: VariantChoice;
  extra: ExtraLine;
  line: CartLine | null;
  words: Words;
  onChange: (next: ExtraLine) => void;
  onRemove: () => void;
}) {
  const designs = useDesignChoice(product, extra.selection);
  const picked = choice.variantFor(extra.selection);
  return (
    <div className="pp-line2">
      <div className="pp-line2-hd">
        <span>{words.t('pp_second')}</span>
        <button type="button" className="lnk" onClick={onRemove}>
          {words.t('pp_remove')}
        </button>
      </div>
      <PhotoCards
        product={product}
        cards={designs.cards}
        designId={designs.designId}
        tapped={designs.tapped}
        nudge={designs.nudging}
        words={words}
        cardsRef={designs.cardsRef}
        onTap={(card) => {
          onChange({ ...extra, selection: designs.tap(card, extra.selection) });
        }}
      />
      <OptionRows
        product={product}
        choice={choice}
        selection={extra.selection}
        words={words}
        onPick={(attributeId, valueId) => {
          onChange({ ...extra, selection: choice.pick(extra.selection, attributeId, valueId) });
        }}
        sizeChartLink={null}
      />
      {!designs.needed && line === null && picked !== null ? (
        <div className="banner warn">
          <Icon name="warn" />
          <span>{words.t('unavailable_hint')}</span>
        </div>
      ) : null}
      <Quantity
        value={extra.quantity}
        unit={product.stockUnit}
        sharedStock={product.sharedStock}
        words={words}
        onChange={(value) => {
          onChange({ ...extra, quantity: value });
        }}
      />
    </div>
  );
}
