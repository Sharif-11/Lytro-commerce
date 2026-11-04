'use client';

import { useEffect, useMemo, useState } from 'react';
import { type Language, plainNumber, Words } from '@/lib/i18n/words';
import { placedPhoneKey } from '@/lib/order/order-form';
import { Icon } from '../icon';

/** ORD-02, LND-11 (`confirm-cod`, `e48-landing-placed`): the order placed -- its number, the shop's call, the tracking ID
    and what happens next. No SMS is promised (Phase 7). The shopper's number comes from the phone that placed it, the
    server never giving one back (ORD-17); opened anywhere else it says the shop will call them (`e48-placed-later`). */
export function PlacedView({
  language,
  orderNumber,
  trackingId,
  codAmount,
  landing,
  offerAccount,
}: {
  language: Language;
  orderNumber: string;
  trackingId: string;
  codAmount: string;
  landing?: boolean;
  /** CUS-07: the way to an account, for someone not signed in; never at the order itself. */
  offerAccount?: boolean;
}) {
  const words = useMemo(() => new Words(language), [language]);
  const [phone, setPhone] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    try {
      setPhone(window.sessionStorage.getItem(placedPhoneKey(trackingId)));
    } catch {
      setPhone(null);
    }
  }, [trackingId]);
  const number = `#${orderNumber}`;
  return (
    <div
      className="bare placed"
      style={{ position: 'static', padding: '32px 16px', minHeight: '100%' }}
    >
      <div className="box">
        <span
          className="logo"
          style={{ background: 'var(--success-soft)', color: 'var(--success)' }}
        >
          <Icon name="check" />
        </span>
        <h1>{words.t(landing ? 'e48LandingThanks' : 'cf_h')}</h1>
        <p>
          {phone
            ? words.t('cf_p', { o: number, ph: phone })
            : words.t('e48CallLater', { o: number })}
        </p>
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
              {trackingId}
            </b>
          </span>
          <button
            type="button"
            className="btn ghost sm"
            aria-label={words.t(copied ? 'copied' : 'copy_link')}
            onClick={() => {
              void navigator.clipboard.writeText(trackingId).then(() => {
                setCopied(true);
              });
            }}
          >
            <Icon name={copied ? 'check' : 'copy'} />
          </button>
        </div>
        <a className="btn primary lg block" href={`/track/${trackingId}`}>
          {words.t('cf_track')}
        </a>
        <div className="card2" style={{ width: '100%', textAlign: 'left' }}>
          <h3>{words.t('cf_next')}</h3>
          <div className="tl">
            <div className="s done">
              <div className="t">{words.t('tr_placed')}</div>
            </div>
            <div className="s todo">
              <div className="t">{words.t('cf_n1')}</div>
            </div>
            <div className="s todo">
              <div className="t">{words.t('cf_n2')}</div>
            </div>
            <div className="s todo">
              <div className="t">{words.t('cf_n3', { t: plainNumber(codAmount) })}</div>
            </div>
          </div>
        </div>
        {offerAccount ? (
          <a
            className="btn ghost block"
            style={{
              whiteSpace: 'normal',
              height: 'auto',
              minHeight: 44,
              padding: '8px 14px',
            }}
            href="/sign-up"
          >
            <Icon name="user" /> {words.t('e48MakeAcct')}
          </a>
        ) : null}
      </div>
    </div>
  );
}
