'use client';

import { useMemo, useState } from 'react';
import { type Language, Words } from '@/lib/i18n/words';
import { shopperRequest } from './shopper-request';

type Tab = 'orders' | 'addresses' | 'profile';

/** `account-orders`: hello and the phone, with Sign out, and the three tabs. */
export function AccountHead({
  language,
  name,
  phone,
  tab,
}: {
  language: Language;
  name: string;
  phone: string;
  tab: Tab;
}) {
  const words = useMemo(() => new Words(language), [language]);
  const [leaving, setLeaving] = useState(false);
  const tabs: [Tab, string, string][] = [
    ['orders', words.t('ac_orders'), '/account'],
    ['addresses', words.t('ac_addresses'), '/account/addresses'],
    ['profile', words.t('e48Profile'), '/account/profile'],
  ];
  return (
    <>
      <div>
        <h1 className="pt">{words.t('ac_hello', { n: name })}</h1>
        <div className="sub">
          {phone} ·{' '}
          <button
            type="button"
            className="lnk"
            style={{ textDecoration: 'underline', cursor: 'pointer' }}
            disabled={leaving}
            onClick={() => {
              setLeaving(true);
              void shopperRequest('POST', 'signout').then(() => {
                window.location.assign('/');
              });
            }}
          >
            {words.t('ac_signout')}
          </button>
        </div>
      </div>
      <div className="chips">
        {tabs.map(([key, label, href]) => (
          <a
            key={key}
            className={key === tab ? 'chip on' : 'chip'}
            href={href}
            aria-current={key === tab ? 'page' : undefined}
          >
            {label}
          </a>
        ))}
      </div>
    </>
  );
}
