'use client';

import { useEffect, useMemo, useState } from 'react';
import { type PaymentMethod, PaymentPolicy } from '@lytronix/validators/enums';
import { areaCookieValue } from '@/lib/area';
import {
  checkCart,
  type CheckedLine,
  isOffLine,
  paysFirst,
  totalWith,
} from '@/lib/cart/cart-check';
import { browserCart, estimateItemOf, lineKey, orderItemOf } from '@/lib/cart/cart-store';
import type { ShopperAddress, ShopperPaymentMethod, ShopperView } from '@/lib/api/storefront-api';
import { type Language, money, plainNumber, Words } from '@/lib/i18n/words';
import { ADDRESS_MAX, lineQuantityText, NAME_MAX, NOTE_MAX } from '@/lib/order/order-form';
import { useCart } from '../cart/use-cart';
import { Icon } from '../icon';
import { rangeText } from '../product/buy-parts';
import { AreaFields, DeliveryBanner, zillaOf } from '../product/sheets';
import { useLocations, useSettledEstimate } from '../product/use-delivery';
import { LineExtras, NoticeBanner, OffLine, SummaryLine, TaxRows } from './order-parts';
import { AdvanceRows, PayChooser, PayNextHint } from './pay-chooser';
import { useOrderPlacing } from './use-order-placing';

export interface CheckoutViewProps {
  language: Language;
  shopPhone: string | null;
  areaId: number | null;
  /** CUS-03, CUS-06: who is signed in, and what they saved; a guest has neither. */
  shopper: ShopperView | null;
  addresses: ShopperAddress[];
  /** WAL-06, SFT-10: how this shop can be paid first. */
  methods: ShopperPaymentMethod[];
}

/** The note an item left out of the total carries. */
function offNote(line: CheckedLine, words: Words): string {
  if (line.state === 'gone') return words.t('line_gone');
  return words.t(line.state === 'refit' ? 'e48LineRefit' : 'line_out');
}

/** PRD-08: how an item needing to be paid for first says so on its line. */
function advanceNote(line: CheckedLine, words: Words): string {
  if (line.advance !== null && line.paymentPolicy === PaymentPolicy.PartialAdvance) {
    return words.t('pay_adv', { n: plainNumber(line.advance) });
  }
  return words.t(line.paymentPolicy === PaymentPolicy.FullPrepayment ? 'pay_full' : 'pay_dc');
}

/** SFT-06, SFT-07, DLV-06, ORD-06a (`checkout`, `pay58-checkout`): one page, guest. A line the shop can't take as it stands is
    named and left out of the total, and Place order waits for its Remove. An order owing an advance chooses how to pay it and
    goes straight to the payment page; one owing none is cash on delivery. With no way to pay, a line needing to be paid for
    first is asked about once, then kept out of what is priced (`pay58-checkout-none`). */
export function CheckoutView(props: CheckoutViewProps) {
  const words = useMemo(() => new Words(props.language), [props.language]);
  const lines = useCart();
  // Signed in, their name and phone, and their default address unless they already picked an area.
  const opening = props.addresses.find((row) => row.isDefault) ?? props.addresses[0] ?? null;
  const form = useOrderPlacing({
    initialThana: props.areaId,
    source: 'storefront',
    initial: {
      ...(props.shopper ? { customerName: props.shopper.name, phone: props.shopper.phone } : {}),
      ...(opening?.location
        ? { thanaId: opening.location.id, deliveryAddress: opening.deliveryAddress }
        : {}),
    },
  });
  const { fields, problems, notice, placing } = form;
  const locations = useLocations(true);
  const [zillaId, setZillaId] = useState<number | null>(null);
  // The lines the shop refused as sold out, and those found to need paying first, by their keys.
  const [refused, setRefused] = useState<ReadonlySet<string>>(new Set());
  const [held, setHeld] = useState<ReadonlyMap<string, CheckedLine>>(new Map());
  const canPayFirst = props.methods.length > 0;
  const [method, setMethod] = useState<PaymentMethod | null>(props.methods[0]?.method ?? null);

  const all = lines ?? [];
  const priced = all.filter((line) => !refused.has(lineKey(line)) && !held.has(lineKey(line)));
  const items = priced.length > 0 ? priced.map(estimateItemOf) : null;
  const answer = useSettledEstimate(null, items, fields.thanaId);
  const estimate = items === null ? null : answer.estimate;
  const cart = checkCart(priced, estimate);
  const refusedLines = checkCart(
    all.filter((line) => refused.has(lineKey(line))),
    null,
    refused,
  ).lines;

  // A line needing to be paid for first is taken out of the sum once the shop says so; the next answer is the rest's.
  useEffect(() => {
    const found = canPayFirst ? [] : cart.lines.filter(paysFirst);
    if (found.length === 0) return;
    setHeld((before) => {
      const next = new Map(before);
      for (const line of found) next.set(line.key, line);
      return next;
    });
  }, [cart.lines, canPayFirst]);

  const heldLines = all.flatMap((line) => held.get(lineKey(line)) ?? []);
  const offLines = [...cart.lines.filter(isOffLine), ...refusedLines];
  const counted = cart.lines.filter(
    (line) => line.total !== null && (canPayFirst || !paysFirst(line)),
  );
  const paying = canPayFirst && counted.some(paysFirst);
  const subtotal = counted.reduce((sum, line) => sum + (line.total ?? 0), 0);
  const thana = fields.thanaId;
  const zone = thana !== null ? (estimate?.zone ?? null) : null;
  const exact =
    thana !== null && estimate?.deliverable === true && estimate.deliveryCharge !== null
      ? Number(estimate.deliveryCharge)
      : null;
  const range = thana === null ? (estimate?.range ?? null) : null;
  const undeliverable = thana !== null && estimate !== null && !estimate.deliverable;
  const total = totalWith(subtotal, exact, range);
  const advance = paying && estimate?.advance ? Number(estimate.advance) : null;
  const canPlace =
    counted.length > 0 &&
    heldLines.length === 0 &&
    (!paying || method !== null) &&
    offLines.length === 0 &&
    !undeliverable &&
    !placing &&
    (thana === null || answer.settled);

  const remove = (key: string) => {
    browserCart().remove(key);
    setRefused((before) => new Set([...before].filter((each) => each !== key)));
    setHeld((before) => new Map([...before].filter(([each]) => each !== key)));
    form.setNotice(null);
  };

  const place = async () => {
    const placed = await form.place(
      counted.map((line) => orderItemOf(line.line)),
      paying && method !== null ? { method } : undefined,
    );
    if (placed) {
      browserCart().clear();
      // SFT-07: an advance goes straight to the payment page.
      window.location.assign(placed.payment?.paymentUrl ?? `/order/${placed.trackingId}`);
    }
  };

  // SFT-20: the thana picked here is the one the cart and every product page price delivery to next.
  useEffect(() => {
    if (thana !== null) document.cookie = areaCookieValue(thana);
  }, [thana]);

  // The shop refused an item as sold out: it is the line it names, or the banner says only that one is.
  useEffect(() => {
    if (notice?.kind !== 'sold_out' || notice.variantId === null) return;
    const named = all.find((line) => line.variantId === notice.variantId);
    if (named) setRefused((before) => new Set([...before, lineKey(named)]));
    // Only a new refusal changes which line is out, so `all` is read as it stands then.
  }, [notice]);

  const title = (
    <div>
      <h1 className="pt">{words.t('co_title')}</h1>
    </div>
  );
  if (lines === null) return title;
  if (lines.length === 0) {
    return (
      <>
        {title}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            gap: 10,
            padding: '32px 0',
          }}
        >
          <Icon name="bag" style={{ width: 40, height: 40, color: 'var(--n300)' }} />
          <b style={{ fontSize: 17 }}>{words.t('cart_empty')}</b>
          <p className="sub">{words.t('cart_empty_hint')}</p>
          <a className="btn ghost" href="/">
            {words.t('continue_')}
          </a>
        </div>
      </>
    );
  }

  const [firstHeld] = heldLines;
  const [firstOff] = offLines;
  const callShop = props.shopPhone ? (
    <a className="btn ghost sm" href={`tel:${props.shopPhone}`}>
      <Icon name="phone" /> {words.t('e48CallShop')}
    </a>
  ) : null;

  let banner = null;
  if (firstHeld) {
    banner = (
      <>
        <NoticeBanner
          tone="warn"
          title={words.t('pay58NoneT')}
          text={
            firstHeld.advance !== null && firstHeld.paymentPolicy === PaymentPolicy.PartialAdvance
              ? words.t('pay58NoneP', {
                  p: firstHeld.line.name,
                  n: plainNumber(firstHeld.advance),
                })
              : words.t('pay58NonePAny', { p: firstHeld.line.name })
          }
        />
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => {
              remove(firstHeld.key);
            }}
          >
            {words.t('e48Remove')}
          </button>
          {callShop}
        </div>
      </>
    );
  } else if (notice?.kind === 'sold_out') {
    banner = (
      <NoticeBanner
        tone="bad"
        title={firstOff ? words.t('short_t', { p: firstOff.line.name }) : words.t('short_any')}
        text={words.t('e48ShortP')}
      />
    );
  } else if (firstOff) {
    const named = { p: firstOff.line.name };
    banner = (
      <NoticeBanner
        tone="bad"
        title={words.t(
          firstOff.state === 'gone' ? 'gone_t' : firstOff.state === 'refit' ? 'refit_t' : 'out_t',
          named,
        )}
        text={words.t('e48OutP')}
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

  const zoneLine = zone && exact !== null ? `${words.pick(zone.name)} · ${money(exact)}` : null;

  return (
    <>
      {title}
      {banner}
      <div className="two">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card2">
            <div className="sechead">
              <h2>{words.t('co_contact')}</h2>
              {props.shopper ? null : (
                <a className="lnk" href="/sign-in?next=/checkout">
                  {words.t('co_signin_lnk')}
                </a>
              )}
            </div>
            <div className="field">
              <label htmlFor="co-name">{words.t('name')}</label>
              <input
                id="co-name"
                className={problems.includes('customerName') ? 'input bad' : 'input'}
                autoComplete="name"
                maxLength={NAME_MAX}
                placeholder={words.t('name_ph')}
                value={fields.customerName}
                onChange={(event) => {
                  form.setField('customerName', event.target.value);
                }}
              />
              {problems.includes('customerName') ? (
                <div className="err">{words.t('err_name')}</div>
              ) : null}
            </div>
            <div className="field">
              <label htmlFor="co-phone">{words.t('phone_')}</label>
              <input
                id="co-phone"
                className={problems.includes('phone') ? 'input bad' : 'input'}
                inputMode="tel"
                autoComplete="tel-national"
                placeholder="01XXXXXXXXX"
                value={fields.phone}
                onChange={(event) => {
                  form.setField('phone', event.target.value);
                }}
              />
              {problems.includes('phone') ? (
                <div className="err">{words.t('err_phone')}</div>
              ) : (
                <div className="help">{words.t('co_phone_help')}</div>
              )}
            </div>
          </div>
          <div className="card2">
            <div className="sechead">
              <h2>{words.t('co_address')}</h2>
            </div>
            {props.addresses.length > 0 ? (
              <div className="chips" style={{ margin: 0 }} role="group">
                {props.addresses.map((saved) => {
                  const on =
                    saved.location?.id === thana &&
                    saved.deliveryAddress === fields.deliveryAddress;
                  return (
                    <button
                      key={saved.id}
                      type="button"
                      className={on ? 'chip on' : 'chip'}
                      aria-pressed={on}
                      disabled={saved.location === null}
                      onClick={() => {
                        setZillaId(saved.location?.zillaId ?? null);
                        form.setThana(saved.location?.id ?? null);
                        form.setField('deliveryAddress', saved.deliveryAddress);
                      }}
                    >
                      {on ? <Icon name="pin" /> : null}
                      {saved.label}
                    </button>
                  );
                })}
              </div>
            ) : null}
            <AreaFields
              locations={locations}
              zillaId={zillaId ?? zillaOf(locations, thana)}
              thanaId={thana}
              words={words}
              onZilla={(id) => {
                setZillaId(id);
                form.setThana(null);
              }}
              onThana={form.setThana}
              thanaHelp={zoneLine}
              thanaError={problems.includes('locationId') ? words.t('err_thana') : null}
            />
            {undeliverable ? (
              <DeliveryBanner estimate={estimate} words={words} shopPhone={props.shopPhone} />
            ) : null}
            <div className="field">
              <label htmlFor="co-address">{words.t('address')}</label>
              <input
                id="co-address"
                className={problems.includes('deliveryAddress') ? 'input bad' : 'input'}
                autoComplete="street-address"
                maxLength={ADDRESS_MAX}
                value={fields.deliveryAddress}
                onChange={(event) => {
                  form.setField('deliveryAddress', event.target.value);
                }}
              />
              {problems.includes('deliveryAddress') ? (
                <div className="err">{words.t('err_addr')}</div>
              ) : null}
            </div>
            <div className="field">
              <label htmlFor="co-note">{words.t('e48Note')}</label>
              <input
                id="co-note"
                className="input"
                maxLength={NOTE_MAX}
                placeholder={words.t('e48NotePh')}
                value={fields.shopperNote}
                onChange={(event) => {
                  form.setField('shopperNote', event.target.value);
                }}
              />
            </div>
          </div>
          {paying ? (
            <PayChooser
              methods={props.methods}
              chosen={method}
              advance={advance}
              words={words}
              onChoose={setMethod}
            />
          ) : (
            <div className="card2">
              <div className="sechead">
                <h2>{words.t('co_payment')}</h2>
              </div>
              <div className="line" style={{ margin: 0 }}>
                <Icon name="cash" />
                <span>
                  <b>{words.t('pay_cod')}</b> · {words.t('pay_cod_hint')}
                </span>
              </div>
            </div>
          )}
        </div>
        <div className="side">
          <div className="card2">
            <h3>{words.t('co_summary')}</h3>
            {counted.map((checked) => (
              <SummaryLine
                key={checked.key}
                name={checked.line.name}
                image={checked.line.image}
                detail={
                  checked.line.choice !== ''
                    ? `${checked.line.choice} × ${lineQuantityText(checked.line, words)}`
                    : `× ${lineQuantityText(checked.line, words)}`
                }
                total={checked.total ?? 0}
              >
                {paysFirst(checked) ? (
                  <div className="vr">{advanceNote(checked, words)}</div>
                ) : null}
                <LineExtras
                  parts={checked.line.partsText}
                  addOns={checked.line.addOns?.map((row) => ({
                    name: row.name,
                    price: row.priceChange,
                  }))}
                  answers={checked.line.answers}
                  words={words}
                />
              </SummaryLine>
            ))}
            {offLines.map((checked) => (
              <OffLine
                key={checked.key}
                name={checked.line.name}
                image={checked.line.image}
                detail={`${checked.line.choice === '' ? '' : `${checked.line.choice} `}× ${lineQuantityText(checked.line, words)}`}
                note={offNote(checked, words)}
                words={words}
                onRemove={() => {
                  remove(checked.key);
                }}
              />
            ))}
            {heldLines.map((checked) => (
              <OffLine
                key={checked.key}
                name={checked.line.name}
                image={checked.line.image}
                detail={`${checked.line.choice === '' ? '' : `${checked.line.choice} `}× ${lineQuantityText(checked.line, words)}`}
                note={advanceNote(checked, words)}
                words={words}
                onRemove={() => {
                  remove(checked.key);
                }}
              />
            ))}
            <div className="sum">
              <div className="r">
                <span className="k">{words.t('subtotal')}</span>
                <span>{money(subtotal)}</span>
              </div>
              <div className="r">
                <span className="k">
                  {words.t('delivery')}
                  {zone && exact !== null ? ` · ${words.pick(zone.name)}` : ''}
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
              {heldLines.length === 0 ? (
                <TaxRows taxes={estimate?.taxes ?? []} words={words} />
              ) : null}
              {paying ? (
                <AdvanceRows
                  advance={advance}
                  total={total.from === total.to ? total.from : null}
                  words={words}
                />
              ) : null}
            </div>
            <button
              type="button"
              className="btn primary lg block"
              disabled={!canPlace}
              aria-busy={placing}
              onClick={() => {
                void place();
              }}
            >
              {!paying
                ? words.t('e48Place')
                : advance === null
                  ? words.t('pay58PlaceAny')
                  : words.t('place_adv', { n: plainNumber(advance) })}
            </button>
            {paying ? <PayNextHint words={words} /> : null}
          </div>
        </div>
      </div>
    </>
  );
}
