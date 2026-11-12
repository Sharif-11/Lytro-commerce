'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { areaCookieValue } from '@/lib/area';
import { PaymentPolicy } from '@lytronix/validators/enums';
import { checkCart, type CheckedCart, type CheckedLine } from '@/lib/cart/cart-check';
import {
  browserCart,
  CART_OPEN,
  type CartLine,
  estimateItemOf,
  lineKey,
} from '@/lib/cart/cart-store';
import { type Language, money, Words } from '@/lib/i18n/words';
import { countedUnits } from '@/lib/product/quantity';
import type { DeliveryEstimate, EstimateItem } from '@/lib/api/storefront-api';
import { Icon } from '../icon';
import { InShell } from '../in-shell';
import { LineExtras, TaxRows } from '../order/order-parts';
import { Stepper } from '../product/buy-parts';
import { AreaSheet, DeliveryBanner, Sheet } from '../product/sheets';
import { useDeliveryEstimate } from '../product/use-delivery';
import { useCart } from './use-cart';

export interface CartButtonProps {
  language: Language;
  shopPhone: string | null;
  areaId: number | null;
  /** The /cart address opens the drawer at once. */
  startOpen?: boolean;
}

// PD-21: how long a removed line can be put back.
const UNDO_MS = 5000;

/** SFT-05, SFT-20: the header's cart, its count, and the drawer it opens (the prototype's cartSheet). */
export function CartButton(props: CartButtonProps) {
  const words = useMemo(() => new Words(props.language), [props.language]);
  const lines = useCart();
  const [open, setOpen] = useState<'cart' | 'area' | null>(props.startOpen ? 'cart' : null);
  const [areaId, setAreaId] = useState(props.areaId);
  // PD-21: the line last removed, and where it was, while it can be put back.
  const [removed, setRemoved] = useState<{ line: CartLine; at: number } | null>(null);
  useEffect(() => {
    if (!removed) return;
    const timer = setTimeout(() => {
      setRemoved(null);
    }, UNDO_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [removed]);
  const remove = useCallback(
    (key: string) => {
      const at = (lines ?? []).findIndex((held) => lineKey(held) === key);
      const line = lines?.[at];
      browserCart().remove(key);
      if (line) setRemoved({ line, at });
    },
    [lines],
  );
  useEffect(() => {
    const show = () => {
      setOpen('cart');
    };
    window.addEventListener(CART_OPEN, show);
    return () => {
      window.removeEventListener(CART_OPEN, show);
    };
  }, []);
  const close = useCallback(() => {
    setOpen(null);
  }, []);
  const backToCart = useCallback(() => {
    setOpen('cart');
  }, []);
  const count =
    lines?.reduce((sum, line) => sum + countedUnits(line.stockUnit, line.quantity), 0) ?? 0;
  const items = lines === null || lines.length === 0 ? null : lines.map(estimateItemOf);

  return (
    <>
      <button
        type="button"
        className="ib"
        aria-label={words.t('cart_title')}
        onClick={() => {
          setOpen('cart');
        }}
      >
        <Icon name="bag" />
        {count > 0 ? <span className="badge">{count}</span> : null}
      </button>
      {open === 'cart' ? (
        <InShell>
          <CartDrawer
            words={words}
            lines={lines ?? []}
            items={items}
            areaId={areaId}
            shopPhone={props.shopPhone}
            onArea={() => {
              setOpen('area');
            }}
            onRemove={remove}
            onClose={close}
          />
        </InShell>
      ) : null}
      {removed ? (
        <InShell>
          <div className="toast" role="status">
            <Icon name="check" />
            <span>{words.t('cart_removed')}</span>
            <button
              type="button"
              className="btn"
              onClick={() => {
                browserCart().restore(removed.line, removed.at);
                setRemoved(null);
              }}
            >
              {words.t('cart_undo')}
            </button>
          </div>
        </InShell>
      ) : null}
      {open === 'area' ? (
        <InShell>
          <AreaSheet
            words={words}
            items={items}
            areaId={areaId}
            shopPhone={props.shopPhone}
            onClose={backToCart}
            onSave={(thanaId) => {
              document.cookie = areaCookieValue(thanaId);
              setAreaId(thanaId);
              setOpen('cart');
            }}
          />
        </InShell>
      ) : null}
    </>
  );
}

/** The drawer itself. It asks for its lines' check each time it opens (one counted call), and again when a quantity
    or the area changes. */
function CartDrawer({
  words,
  lines,
  items,
  areaId,
  shopPhone,
  onArea,
  onRemove,
  onClose,
}: {
  words: Words;
  lines: CartLine[];
  items: EstimateItem[] | null;
  areaId: number | null;
  shopPhone: string | null;
  onArea: () => void;
  onRemove: (key: string) => void;
  onClose: () => void;
}) {
  const answer = useDeliveryEstimate(null, items, areaId);
  const estimate = items === null ? null : answer;
  const areaSet = areaId !== null;
  const cart = checkCart(lines, estimate);
  if (lines.length === 0) {
    return (
      <Sheet title={words.t('cart_title')} words={words} onClose={onClose} drawer>
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
          <button type="button" className="btn ghost" onClick={onClose}>
            {words.t('continue_')}
          </button>
        </div>
      </Sheet>
    );
  }
  const undeliverable = areaSet && estimate !== null && cart.orderable && !estimate.deliverable;
  return (
    <Sheet
      title={`${words.t('cart_title')} · ${words.count('cart_n', cart.items)}`}
      words={words}
      onClose={onClose}
      drawer
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>
            {words.t('continue_')}
          </button>
          {cart.orderable && !undeliverable ? (
            <a className="btn primary" href="/checkout">
              {words.t('checkout')}
            </a>
          ) : (
            <button type="button" className="btn primary" disabled>
              {words.t('checkout')}
            </button>
          )}
        </>
      }
    >
      <div>
        {cart.lines.map((checked) => (
          <CartLineRow key={checked.key} checked={checked} words={words} onRemove={onRemove} />
        ))}
      </div>
      {cart.orderable ? (
        <Summary cart={cart} estimate={estimate} areaSet={areaSet} words={words} onArea={onArea} />
      ) : null}
      {undeliverable ? (
        <DeliveryBanner estimate={estimate} words={words} shopPhone={shopPhone} />
      ) : null}
    </Sheet>
  );
}

/** One line: its photo (the chosen design's cover, PD-6), name, choices, quantity with its unit, and the trash button
    beside it (PD-21), as the prototype's `cartLines` draws them. */
function CartLineRow({
  checked,
  words,
  onRemove,
}: {
  checked: CheckedLine;
  words: Words;
  onRemove: (key: string) => void;
}) {
  const { line, state, key } = checked;
  const remove = (
    <button
      type="button"
      className="rmi"
      aria-label={words.t('remove')}
      title={words.t('remove')}
      onClick={() => {
        onRemove(key);
      }}
    >
      <Icon name="trash" />
    </button>
  );
  const thumb = line.image ? (
    <img className="th photo" src={line.image} alt="" />
  ) : (
    <span className="th">{Array.from(line.name.trim())[0]}</span>
  );
  const name = (
    <a className="nm" href={`/p/${line.productSlug}`}>
      {line.name}
    </a>
  );
  if (state === 'out' || state === 'gone' || state === 'refit') {
    return (
      <div className="cl off">
        {thumb}
        <div className="b">
          {name}
          {line.choice ? <div className="vr">{line.choice}</div> : null}
          <div className="note">
            {words.t(
              state === 'out' ? 'line_out' : state === 'gone' ? 'line_gone' : 'e48LineRefit',
            )}
          </div>
          {remove}
        </div>
      </div>
    );
  }
  // The variant, then what its product asks first, as the prototype's line writes them; either may be missing.
  const detail = [
    line.choice,
    checked.paymentPolicy === PaymentPolicy.DeliveryChargeOnly
      ? words.t('pay_dc')
      : checked.advance === null
        ? ''
        : words.t('pay_adv', { n: checked.advance }),
  ]
    .filter((part) => part !== '')
    .join(' · ');
  return (
    <div className="cl">
      {thumb}
      <div className="b">
        {name}
        {detail !== '' ? <div className="vr">{detail}</div> : null}
        <LineExtras
          parts={line.partsText}
          addOns={line.addOns?.map((row) => ({ name: row.name, price: row.priceChange }))}
          answers={line.answers}
          words={words}
        />
        {checked.was !== null ? (
          <div className="note">{words.t('line_was', { p: money(checked.was) })}</div>
        ) : null}
        <div className="row">
          <span className="qrm">
            <Stepper
              value={line.quantity}
              unit={line.stockUnit}
              sharedStock={line.sharedStock ?? false}
              words={words}
              onChange={(next) => {
                browserCart().setQuantity(key, next);
              }}
            />
            {remove}
          </span>
          <span className="price">{checked.total === null ? '' : money(checked.total)}</span>
        </div>
      </div>
    </div>
  );
}

/** The cart's sum: its items, the delivery (the exact charge once an address is set; before it, the shop's highest charge
    and the way to the exact one, PD-25), and one total. */
function Summary({
  cart,
  estimate,
  areaSet,
  words,
  onArea,
}: {
  cart: CheckedCart;
  estimate: DeliveryEstimate | null;
  areaSet: boolean;
  words: Words;
  onArea: () => void;
}) {
  const exact =
    areaSet && estimate?.deliverable === true && estimate.deliveryCharge !== null
      ? Number(estimate.deliveryCharge)
      : null;
  const highest = exact === null && estimate?.range ? Number(estimate.range.to) : null;
  // As the prototype's summary draws its two address links.
  const areaLink = (key: 'change' | 'deliv_area' | 'deliv_exact', bold: boolean) => (
    <button
      type="button"
      className="lnk"
      style={{ color: 'var(--accent-text)', cursor: 'pointer', fontWeight: bold ? 600 : undefined }}
      onClick={onArea}
    >
      {words.t(key)}
    </button>
  );
  const total = money(cart.subtotal + (exact ?? highest ?? 0));
  return (
    <>
      <div className="sum">
        <div className="r">
          <span className="k">
            {words.t('subtotal')} · {words.count('cart_n', cart.items)}
          </span>
          <span className="price">{money(cart.subtotal)}</span>
        </div>
        <div className="r">
          <span className="k">
            {words.t('delivery')}
            {exact !== null && estimate?.zone ? (
              <>
                {' · '}
                {words.pick(estimate.zone.name)} {areaLink('change', false)}
              </>
            ) : null}
          </span>
          <span>
            {exact !== null
              ? money(exact)
              : highest !== null
                ? money(highest)
                : areaLink(areaSet ? 'change' : 'deliv_area', true)}
          </span>
        </div>
        {exact === null && highest !== null ? (
          <div className="r" style={{ fontSize: 13 }}>
            {areaLink(areaSet ? 'change' : 'deliv_exact', true)}
          </div>
        ) : null}
        <div className="r total">
          <span>{words.t('total')}</span>
          <span className="price">{total}</span>
        </div>
        <TaxRows taxes={estimate?.taxes ?? []} words={words} />
      </div>
      <div className="sub" style={{ fontSize: 12 }}>
        {words.t('cart_est_note')}
      </div>
    </>
  );
}
