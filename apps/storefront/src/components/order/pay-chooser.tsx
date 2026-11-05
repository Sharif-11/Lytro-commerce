'use client';

import type { ReactNode } from 'react';
import { PaymentMethod, PaymentMethodKind, PaymentWay } from '@lytronix/validators/enums';
import type { ShopperPaymentMethod } from '@/lib/api/storefront-api';
import { money, type Words } from '@/lib/i18n/words';
import { Icon } from '../icon';

/** The wallets' own names, which no language changes. */
const NAMES: Readonly<Partial<Record<PaymentMethod, string>>> = {
  [PaymentMethod.Bkash]: 'bKash',
  [PaymentMethod.Nagad]: 'Nagad',
  [PaymentMethod.Rocket]: 'Rocket',
  [PaymentMethod.Upay]: 'Upay',
};

/** STOREFRONT-DESIGN §8a: a wallet's official mark, never recoloured; Rocket and Upay in their colours until theirs are fetched. */
function markOf(method: PaymentMethod, words: Words): { mark: ReactNode; name: string | null } {
  if (method === PaymentMethod.Bkash || method === PaymentMethod.Nagad) {
    return {
      mark: (
        <span className="wlogo">
          <img src={`/marks/${method}.png`} alt="" height={20} />
        </span>
      ),
      name: NAMES[method] ?? null,
    };
  }
  if (method === PaymentMethod.Rocket) {
    return {
      mark: (
        <span className="wlogo txt" style={{ color: '#892C8C' }}>
          Rocket
        </span>
      ),
      name: null,
    };
  }
  if (method === PaymentMethod.Upay) {
    return {
      mark: (
        <span className="wlogo txt" style={{ color: '#1F4E98' }}>
          উপায়
        </span>
      ),
      name: null,
    };
  }
  return {
    mark: (
      <span
        className="wlogo"
        style={{ background: 'var(--sunken)', color: 'var(--text)', height: 24 }}
      >
        <Icon name="box" />
      </span>
    ),
    name: words.t('pm_bank'),
  };
}

function hintOf(row: ShopperPaymentMethod, words: Words): string {
  if (row.kind === PaymentMethodKind.Bank) return words.t('pay58Bank');
  if (row.way === PaymentWay.Automated) {
    return words.t('pay58Gateway', { w: NAMES[row.method] ?? '' });
  }
  return words.t('pay58Manual');
}

/** SFT-10, WAL-05, WAL-10 (`pay58-checkout`, `pay58-landing`): the ways the shop takes an advance, each saying how it pays. */
export function PayChooser({
  methods,
  chosen,
  advance,
  words,
  onChoose,
}: {
  methods: readonly ShopperPaymentMethod[];
  chosen: PaymentMethod | null;
  /** The advance owed, once the server knows it. */
  advance: number | null;
  words: Words;
  onChoose: (method: PaymentMethod) => void;
}) {
  return (
    <div className="card2">
      <div className="sechead">
        <h2>
          {words.t('co_payment')} · {words.t('adv_now')}
          {advance === null ? '' : ` ${money(advance)}`}
        </h2>
      </div>
      {methods.map((row) => {
        const { mark, name } = markOf(row.method, words);
        const on = row.method === chosen;
        return (
          <label key={row.method} className={on ? 'radio on' : 'radio'}>
            <input
              type="radio"
              name="pay-method"
              value={row.method}
              checked={on}
              style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
              onChange={() => {
                onChoose(row.method);
              }}
            />
            <span className="dot" />
            <span className="b">
              <span className="l1">
                {mark}
                {name ? <span>{name}</span> : null}
              </span>
              <span className="l2">{hintOf(row, words)}</span>
            </span>
          </label>
        );
      })}
    </div>
  );
}

/** PRD-08, ORD-16: what is paid now, and what is left for delivery. */
export function AdvanceRows({
  advance,
  total,
  words,
}: {
  advance: number | null;
  total: number | null;
  words: Words;
}) {
  return (
    <>
      <div className="r total">
        <span>{words.t('adv_now')}</span>
        <span className="price">{advance === null ? '—' : money(advance)}</span>
      </div>
      <div className="r">
        <span className="k">{words.t('cod_rem')}</span>
        <span>{advance === null || total === null ? '—' : money(total - advance)}</span>
      </div>
    </>
  );
}

/** SFT-07: nothing is collected here; the shopper is told where it happens. */
export function PayNextHint({ words }: { words: Words }) {
  return (
    <div className="line" style={{ justifyContent: 'center', margin: 0 }}>
      <Icon name="lock" />
      <span>{words.t('pay58Next')}</span>
    </div>
  );
}
