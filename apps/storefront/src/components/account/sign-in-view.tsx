'use client';

import { bdMobileNumber } from '@lytronix/validators/common';
import { useCallback, useMemo, useState } from 'react';
import { whatsAppLink } from '@/lib/account/shopper-cookie';
import { type Language, Words } from '@/lib/i18n/words';
import { Icon } from '../icon';
import { Sheet } from '../product/sheets';
import { shopperRequest } from './shopper-request';

type Refusal = 'wrong' | 'locked' | 'failed' | null;

/** CUS-03 (`account-signin`): phone and password. A wrong one says the two don't match without saying which (AUTH-13); five
    in a row lock it for 15 minutes (AUTH-14). Forgetting it asks the shop, who sets a new one (CUS-14). */
export function SignInView({
  language,
  next,
  shopPhone,
}: {
  language: Language;
  next: string;
  shopPhone: string | null;
}) {
  const words = useMemo(() => new Words(language), [language]);
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [badPhone, setBadPhone] = useState(false);
  const [refusal, setRefusal] = useState<Refusal>(null);
  const [sending, setSending] = useState(false);
  const [forgot, setForgot] = useState(false);
  const closeForgot = useCallback(() => {
    setForgot(false);
  }, []);

  const signIn = async () => {
    const wrongPhone = bdMobileNumber(phone) === null;
    setBadPhone(wrongPhone);
    if (wrongPhone || password === '' || sending) return;
    setSending(true);
    setRefusal(null);
    const answer = await shopperRequest('POST', 'signin', { phone: phone.trim(), password });
    if (answer.status === 200) {
      window.location.assign(next);
      return;
    }
    setSending(false);
    setRefusal(answer.status === 401 ? 'wrong' : answer.status === 429 ? 'locked' : 'failed');
  };

  return (
    <div
      style={{
        maxWidth: 440,
        width: '100%',
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
    >
      <div>
        <h1 className="pt">{words.t('ac_signin')}</h1>
        <div className="sub">{words.t('ac_hint')}</div>
      </div>
      {refusal === 'locked' ? (
        <div className="banner bad" role="alert">
          <Icon name="lock" />
          <span>{words.t('e48Locked')}</span>
        </div>
      ) : refusal === 'wrong' ? (
        <div className="banner bad" role="alert">
          <Icon name="warn" />
          <span>{words.t('e48WrongPw')}</span>
        </div>
      ) : refusal === 'failed' ? (
        <div className="banner bad" role="alert">
          <Icon name="warn" />
          <span>{words.t('e48SendFailP')}</span>
        </div>
      ) : null}
      <form
        className="card2"
        onSubmit={(event) => {
          event.preventDefault();
          void signIn();
        }}
      >
        <div className="field">
          <label htmlFor="si-phone">{words.t('phone_')}</label>
          <input
            id="si-phone"
            className={badPhone ? 'input bad' : 'input'}
            inputMode="tel"
            autoComplete="username"
            placeholder="01XXXXXXXXX"
            value={phone}
            onChange={(event) => {
              setPhone(event.target.value);
              setBadPhone(false);
            }}
          />
          {badPhone ? <div className="err">{words.t('err_phone')}</div> : null}
        </div>
        <div className="field">
          <label htmlFor="si-password">{words.t('e48Password')}</label>
          <input
            id="si-password"
            className={refusal === 'wrong' ? 'input bad' : 'input'}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
            }}
          />
        </div>
        <button
          type="submit"
          className="btn primary lg block"
          disabled={sending || refusal === 'locked'}
          aria-busy={sending}
        >
          {words.t('ac_signin')}
        </button>
        <button
          type="button"
          className="lnk"
          style={{ textAlign: 'center', color: 'var(--accent-text)', cursor: 'pointer' }}
          onClick={() => {
            setForgot(true);
          }}
        >
          {words.t('e48Forgot')}
        </button>
      </form>
      <a className="btn ghost block" href="/sign-up">
        {words.t('e48NoAcct')}
      </a>
      {forgot ? (
        <Sheet
          title={words.t('e48ForgotT')}
          words={words}
          onClose={closeForgot}
          footer={
            shopPhone ? (
              <>
                <a className="btn ghost" href={`tel:${shopPhone}`}>
                  <Icon name="phone" /> {words.t('e48CallShop')}
                </a>
                <a
                  className="btn primary"
                  href={whatsAppLink(shopPhone)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Icon name="wa" /> {words.t('whatsapp')}
                </a>
              </>
            ) : undefined
          }
        >
          <p className="sub">{words.t('e48ForgotP')}</p>
        </Sheet>
      ) : null}
    </div>
  );
}
