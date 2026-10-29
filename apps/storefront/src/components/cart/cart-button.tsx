'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { areaCookieValue } from '@/lib/area';
import { checkCart, type CheckedCart, type CheckedLine } from '@/lib/cart/cart-check';
import { browserCart, CART_OPEN, type CartLine } from '@/lib/cart/cart-store';
import { type Language, money, Words } from '@/lib/i18n/words';
import type { DeliveryEstimate, EstimateItem } from '@/lib/api/storefront-api';
import { Icon } from '../icon';
import { InShell } from '../in-shell';
import { rangeText, Stepper } from '../product/buy-parts';
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

/** SFT-05, SFT-20: the header's cart, its count, and the drawer it opens (the prototype's cartSheet). */
export function CartButton(props: CartButtonProps) {
  const words = useMemo(() => new Words(props.language), [props.language]);
  const lines = useCart();
  const [open, setOpen] = useState<'cart' | 'area' | null>(props.startOpen ? 'cart' : null);
  const [areaId, setAreaId] = useState(props.areaId);
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
  const count = lines?.reduce((sum, line) => sum + line.quantity, 0) ?? 0;
  const items =
    lines === null || lines.length === 0
      ? null
      : lines.map((line) => ({ variantId: line.variantId, quantity: line.quantity }));

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
            onClose={close}
          />
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
  onClose,
}: {
  words: Words;
  lines: CartLine[];
  items: EstimateItem[] | null;
  areaId: number | null;
  shopPhone: string | null;
  onArea: () => void;
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
      footClass="soon"
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>
            {words.t('continue_')}
          </button>
          {/* Slice 12's read: ordering opens with Phase 4; until then Checkout is drawn, switched off. */}
          <button type="button" className="btn primary" disabled>
            {words.t('checkout')}
          </button>
          <span className="soonline">{words.t('ordering_soon')}</span>
        </>
      }
    >
      <div>
        {cart.lines.map((checked) => (
          <CartLineRow key={checked.line.variantId} checked={checked} words={words} />
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

function CartLineRow({ checked, words }: { checked: CheckedLine; words: Words }) {
  const { line, state } = checked;
  const remove = (
    <button
      type="button"
      className="rm"
      onClick={() => {
        browserCart().remove(line.variantId);
      }}
    >
      {words.t('remove')}
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
  if (state === 'out' || state === 'gone') {
    return (
      <div className="cl off">
        {thumb}
        <div className="b">
          {name}
          {line.choice ? <div className="vr">{line.choice}</div> : null}
          <div className="note">{words.t(state === 'out' ? 'line_out' : 'line_gone')}</div>
          {remove}
        </div>
      </div>
    );
  }
  // The variant, then the advance its product asks, as the prototype's line writes them; either may be missing.
  const detail = [
    line.choice,
    checked.advance === null ? '' : words.t('pay_adv', { n: checked.advance }),
  ]
    .filter((part) => part !== '')
    .join(' · ');
  return (
    <div className="cl">
      {thumb}
      <div className="b">
        {name}
        {detail !== '' ? <div className="vr">{detail}</div> : null}
        {checked.was !== null ? (
          <div className="note">{words.t('line_was', { p: money(checked.was) })}</div>
        ) : null}
        <div className="row">
          <Stepper
            value={line.quantity}
            onChange={(next) => {
              browserCart().setQuantity(line.variantId, next);
            }}
          />
          <span className="price">{checked.total === null ? '' : money(checked.total)}</span>
        </div>
        {remove}
      </div>
    </div>
  );
}

/** The cart's sum: its items, the delivery (the exact charge once an area is set, the range before), and the total. */
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
  const range = exact === null ? (estimate?.range ?? null) : null;
  // As the prototype's summary draws its two area links.
  const areaLink = (key: 'change' | 'deliv_area', bold: boolean) => (
    <button
      type="button"
      className="lnk"
      style={{ color: 'var(--accent-text)', cursor: 'pointer', fontWeight: bold ? 600 : undefined }}
      onClick={onArea}
    >
      {words.t(key)}
    </button>
  );
  let total = money(cart.subtotal);
  if (exact !== null) total = money(cart.subtotal + exact);
  else if (range !== null) {
    total =
      Number(range.from) === Number(range.to)
        ? money(cart.subtotal + Number(range.from))
        : `${money(cart.subtotal + Number(range.from))} – ${money(cart.subtotal + Number(range.to))}`;
  }
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
            {exact !== null ? money(exact) : areaLink(areaSet ? 'change' : 'deliv_area', true)}
          </span>
        </div>
        {exact === null && range !== null ? (
          <div className="r" style={{ fontSize: 12, color: 'var(--subtle)' }}>
            <span>{rangeText(range, words)}</span>
          </div>
        ) : null}
        <div className="r total">
          <span>{words.t('total')}</span>
          <span className="price">{total}</span>
        </div>
      </div>
      <div className="sub" style={{ fontSize: 12 }}>
        {words.t('cart_est_note')}
      </div>
    </>
  );
}
