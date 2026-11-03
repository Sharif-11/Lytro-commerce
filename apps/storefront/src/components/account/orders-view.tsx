'use client';

import { OrderStatus } from '@lytronix/validators/enums';
import { useMemo, useState } from 'react';
import type { ShopperOrderPage, ShopperOrderRow } from '@/lib/api/storefront-api';
import { dayMonthYear } from '@/lib/i18n/dates';
import { type Language, money, type WordKey, Words } from '@/lib/i18n/words';
import { shopperRequest } from './shopper-request';

/** ORD-18: a status as a shopper reads it (ORD-17), in the colour the sketch gives its kind. */
function statusOf(status: OrderStatus): { word: WordKey; tone: 'ok' | 'low' | 'out' } {
  switch (status) {
    case OrderStatus.Delivered:
    case OrderStatus.PartialDelivered:
    case OrderStatus.Completed:
      return { word: 'tr_delivered', tone: 'ok' };
    case OrderStatus.Shipped:
      return { word: 'tr_shipped', tone: 'low' };
    case OrderStatus.Confirmed:
    case OrderStatus.Processing:
      return { word: 'tr_confirmed', tone: 'low' };
    case OrderStatus.Cancelled:
    case OrderStatus.Rejected:
      return { word: 'e48Cancelled', tone: 'out' };
    case OrderStatus.Returned:
    case OrderStatus.Refunded:
      return { word: 'e48Returned', tone: 'out' };
    case OrderStatus.Unverified:
    case OrderStatus.Pending:
    case OrderStatus.Hold:
    case OrderStatus.InReview:
      return { word: 'tr_placed', tone: 'low' };
  }
}

function OrderRow({ order, words }: { order: ShopperOrderRow; words: Words }) {
  const { word, tone } = statusOf(order.status);
  return (
    <a
      className="cl"
      style={{ padding: '14px 16px', color: 'inherit', textDecoration: 'none' }}
      href={`/track/${order.trackingId}`}
    >
      <div className="b">
        <div className="nm" style={{ fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 14 }}>
          #{order.orderNumber}
        </div>
        <div className="vr">{dayMonthYear(order.createdAt)}</div>
      </div>
      <div
        style={{
          textAlign: 'right',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          alignItems: 'flex-end',
        }}
      >
        <span className={`st ${tone}`}>{words.t(word)}</span>
        <span className="price">{money(order.grandTotal)}</span>
      </div>
    </a>
  );
}

/** ORD-18 (`account-orders`): every order with this phone, wherever it was placed, each opening its tracking; none yet says
    so (`e48-orders-empty`), and Show more reads the next 20 (`e48-orders-more`). */
export function OrdersView({ language, first }: { language: Language; first: ShopperOrderPage }) {
  const words = useMemo(() => new Words(language), [language]);
  const [orders, setOrders] = useState(first.orders);
  const [page, setPage] = useState(first.page);
  const [loading, setLoading] = useState(false);
  if (orders.length === 0) {
    return (
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
        <b style={{ fontSize: 17 }}>{words.t('e48NoOrders')}</b>
        <p className="sub">{words.t('e48NoOrdersP')}</p>
        <a className="btn ghost" href="/">
          {words.t('continue_')}
        </a>
      </div>
    );
  }
  return (
    <>
      <p className="sub" style={{ margin: 0 }}>
        {words.t('e48MyOrdersH')}
      </p>
      <div className="card2" style={{ padding: 0 }}>
        {orders.map((order) => (
          <OrderRow key={order.trackingId} order={order} words={words} />
        ))}
      </div>
      {page < first.pages ? (
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <button
            type="button"
            className="btn ghost"
            disabled={loading}
            onClick={() => {
              setLoading(true);
              void shopperRequest<ShopperOrderPage>('GET', `orders?page=${String(page + 1)}`).then(
                (answer) => {
                  setLoading(false);
                  if (answer.data) {
                    setOrders([...orders, ...answer.data.orders]);
                    setPage(answer.data.page);
                  }
                },
              );
            }}
          >
            {words.t('load_more')}
          </button>
        </div>
      ) : null}
    </>
  );
}
