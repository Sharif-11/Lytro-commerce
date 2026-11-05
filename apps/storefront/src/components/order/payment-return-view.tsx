'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { bdMobileNumber } from '@lytronix/validators/common';
import type { ComponentProps, ReactNode } from 'react';
import type { TrackedOrder } from '@/lib/api/storefront-api';
import { type Language, money, Words } from '@/lib/i18n/words';
import { minutesLeft, type PaymentStanding } from '@/lib/order/payment-return';
import { Icon } from '../icon';

// PAY-17: how often an order whose payment is being checked looks again.
const LOOK_AGAIN_MS = 10_000;

/** STOREFRONT-DESIGN §8a (`pay-paid`, `pay-checking`, `pay-cancelled`, `pay-expired`): an order's page once it owed an advance. */
export function PaymentReturnView({
  language,
  order,
  standing,
  rejected,
  shopPhone,
  storefrontOn,
}: {
  language: Language;
  order: TrackedOrder;
  standing: PaymentStanding;
  /** The payment page said staff rejected it. Only the wording rests on it; the order says what happened (PAY-11). */
  rejected: boolean;
  shopPhone: string | null;
  storefrontOn: boolean;
}) {
  const words = useMemo(() => new Words(language), [language]);
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const number = `#${order.orderNumber}`;

  useEffect(() => {
    if (standing !== 'checking') return undefined;
    const timer = window.setInterval(() => {
      router.refresh();
    }, LOOK_AGAIN_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, [standing, router]);

  const mobile = shopPhone ? bdMobileNumber(shopPhone) : null;
  const contact = shopPhone ? (
    <div style={{ display: 'flex', gap: 8, width: '100%' }}>
      <a className="btn ghost" style={{ flex: 1 }} href={`tel:${shopPhone}`}>
        <Icon name="phone" /> {words.t('e48CallShop')}
      </a>
      {mobile ? (
        <a
          className="btn ghost"
          style={{ flex: 1 }}
          href={`https://wa.me/88${mobile}`}
          rel="noopener noreferrer"
        >
          WhatsApp
        </a>
      ) : null}
    </div>
  ) : null;

  const trackingCard = (
    <div
      className="card2"
      style={{
        width: '100%',
        textAlign: 'left',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}
    >
      <span>
        <span className="sub">{words.t('e48TrackId')}</span>
        <br />
        <b style={{ fontFamily: 'ui-monospace,Menlo,monospace', letterSpacing: '.08em' }}>
          {order.trackingId}
        </b>
      </span>
      <button
        type="button"
        className="btn ghost sm"
        aria-label={words.t(copied ? 'copied' : 'copy_link')}
        onClick={() => {
          void navigator.clipboard.writeText(order.trackingId).then(() => {
            setCopied(true);
          });
        }}
      >
        <Icon name={copied ? 'check' : 'copy'} />
      </button>
    </div>
  );
  const track = (
    <a className="btn primary lg block" href={`/track/${order.trackingId}`}>
      {words.t('cf_track')}
    </a>
  );

  const box = (
    tone: 'success' | 'warning' | 'danger',
    icon: ComponentProps<typeof Icon>['name'],
    title: string,
    text: string,
    children: ReactNode,
  ) => (
    <div
      className="bare placed"
      style={{ position: 'static', padding: '32px 16px', minHeight: '100%' }}
    >
      <div className="box">
        <span
          className="logo"
          style={{ background: `var(--${tone}-soft)`, color: `var(--${tone})` }}
        >
          <Icon name={icon} />
        </span>
        <h1>{title}</h1>
        <p>{text}</p>
        {children}
      </div>
    </div>
  );

  switch (standing) {
    case 'paid':
      return box(
        'success',
        'check',
        words.t('pay58PaidT'),
        words.t('pay58PaidP', { o: number }),
        <>
          <div className="card2" style={{ width: '100%', textAlign: 'left' }}>
            <div className="sum">
              <div className="r">
                <span className="k">{words.t('pay58Paid')}</span>
                <span className="price">{money(Number(order.grandTotal) - Number(order.due))}</span>
              </div>
              <div className="r">
                <span className="k">{words.t('cod_rem')}</span>
                <span>{money(order.due)}</span>
              </div>
            </div>
          </div>
          {trackingCard}
          {track}
        </>,
      );
    case 'checking':
      return box(
        'warning',
        'clock',
        words.t('pay58CheckT'),
        words.t('pay58CheckP', { o: number }),
        <>
          {trackingCard}
          {track}
          {order.payment ? (
            <a className="btn quiet" href={order.payment.paymentUrl}>
              {words.t('pay58FixId')}
            </a>
          ) : null}
        </>,
      );
    case 'unpaid':
      return box(
        'warning',
        'warn',
        words.t('pc_h'),
        words.t('pay58UnpaidP', {
          o: number,
          m: order.payment ? minutesLeft(order.payment.expiresAt, Date.now()) : 1,
        }),
        <>
          {order.payment ? (
            <a className="btn primary lg block" href={order.payment.paymentUrl}>
              {words.t('retry')}
            </a>
          ) : null}
          {contact}
        </>,
      );
    case 'gone':
      return box(
        'danger',
        'clock',
        words.t(rejected ? 'pay58RejectedT' : 'pay58GoneT'),
        words.t(rejected ? 'pay58RejectedP' : 'pay58GoneP'),
        <>
          {storefrontOn ? (
            <a className="btn primary lg block" href="/">
              {words.t('pay58Again')}
            </a>
          ) : null}
          {contact}
        </>,
      );
  }
}
