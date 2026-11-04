'use client';

import {
  bdMobileNumber,
  CUSTOMER_NAME_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '@lytronix/validators/common';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { type Language, Words } from '@/lib/i18n/words';
import { Icon } from '../icon';
import { shopperRequest } from './shopper-request';

const CODE_LENGTH = 6;

type Step = 'phone' | 'code' | 'details';
type SendRefusal = 'taken' | 'nosend' | 'failed' | 'busy' | null;
type CodeRefusal = 'wrong' | 'old' | 'many' | null;

function PageWidth({ children }: { children: ReactNode }) {
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
      {children}
    </div>
  );
}

/** CUS-03, CUS-04, CUS-07 (`e48-signup`): the phone, a code sent once to check it's theirs, then a name and a password. The
    server checks the code only when the account is made, so a wrong one comes back from the last step to this one, with
    what was typed kept (`e48-otp-wrong`). An account is made here only, never at checkout. */
export function SignUpView({
  language,
  next,
  shopPhone,
}: {
  language: Language;
  next: string;
  shopPhone: string | null;
}) {
  const words = useMemo(() => new Words(language), [language]);
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [badPhone, setBadPhone] = useState(false);
  const [refusal, setRefusal] = useState<SendRefusal>(null);
  const [code, setCode] = useState('');
  const [codeRefusal, setCodeRefusal] = useState<CodeRefusal>(null);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [tried, setTried] = useState(false);
  const [failed, setFailed] = useState(false);
  const [sending, setSending] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => {
      setResendIn((left) => left - 1);
    }, 1000);
    return () => {
      clearTimeout(timer);
    };
  }, [resendIn]);

  /** Sends the code, leading on to its step; a refusal shows on the phone's step. */
  const sendCode = async (): Promise<void> => {
    const wrong = bdMobileNumber(phone) === null;
    setBadPhone(wrong);
    if (wrong || sending) return;
    setSending(true);
    setRefusal(null);
    const answer = await shopperRequest<{ resendAfterSeconds: number }>('POST', 'code', {
      phone: phone.trim(),
    });
    setSending(false);
    if (answer.status === 200 && answer.data) {
      setResendIn(answer.data.resendAfterSeconds);
      setCode('');
      setCodeRefusal(null);
      setStep('code');
      return;
    }
    if (answer.status === 409) setRefusal('taken');
    else if (answer.status === 429 && answer.code === 'quota_exceeded') setRefusal('nosend');
    else if (answer.status === 429) setRefusal('busy');
    else setRefusal('failed');
    if (step !== 'phone') setStep('phone');
  };

  const nameWrong = name.trim() === '';
  const passwordWrong =
    password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH;

  const makeAccount = async () => {
    setTried(true);
    if (nameWrong || passwordWrong || sending) return;
    setSending(true);
    setFailed(false);
    const answer = await shopperRequest('POST', 'signup', {
      phone: phone.trim(),
      code,
      name: name.trim(),
      password,
    });
    if (answer.status === 201) {
      window.location.assign(next);
      return;
    }
    setSending(false);
    if (answer.fields['code'] === 'incorrect') {
      setCodeRefusal('wrong');
      setStep('code');
    } else if (answer.fields['code'] === 'expired') {
      setCodeRefusal('old');
      setStep('code');
    } else if (answer.status === 429) {
      setCodeRefusal('many');
      setStep('code');
    } else if (answer.status === 409) {
      setRefusal('taken');
      setStep('phone');
    } else {
      setFailed(true);
    }
  };

  const shownPhone = phone.trim();

  if (step === 'code') {
    const mustRenew = codeRefusal === 'old' || codeRefusal === 'many';
    const message =
      codeRefusal === 'wrong'
        ? words.t('e48CodeWrong')
        : codeRefusal === 'old'
          ? words.t('e48CodeOld')
          : codeRefusal === 'many'
            ? words.t('e48CodeMany')
            : null;
    return (
      <PageWidth>
        <div>
          <h1 className="pt">{words.t('ac_code')}</h1>
          <div className="sub">{words.t('e48CodeSent', { ph: shownPhone })}</div>
        </div>
        <form
          className="card2"
          onSubmit={(event) => {
            event.preventDefault();
            if (code.length === CODE_LENGTH && !mustRenew) {
              setCodeRefusal(null);
              setStep('details');
            }
          }}
        >
          <div className="field">
            <label htmlFor="su-code">{words.t('ac_code')}</label>
            {/* The six boxes drawn are the one field's digits; a phone offers the text's code to it. */}
            <div style={{ position: 'relative' }}>
              <div className="otp" aria-hidden="true">
                {Array.from({ length: CODE_LENGTH }, (_, at) => (
                  <span
                    key={at}
                    className={`${at === code.length ? 'on' : ''} ${message ? 'bad' : ''}`}
                  >
                    {code[at] ?? ''}
                  </span>
                ))}
              </div>
              <input
                id="su-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={CODE_LENGTH}
                value={code}
                aria-invalid={message !== null}
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  opacity: 0,
                }}
                onChange={(event) => {
                  setCode(event.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH));
                  if (codeRefusal === 'wrong') setCodeRefusal(null);
                }}
              />
            </div>
            {message ? (
              <div className="err" role="alert">
                {message}
              </div>
            ) : (
              <div className="help">{words.t('ac_otp_help')}</div>
            )}
          </div>
          {resendIn > 0 ? (
            <div className="sub" style={{ textAlign: 'center', fontSize: 13 }}>
              {words.t('e48ResendIn', { s: resendIn })}
            </div>
          ) : (
            <button
              type="button"
              className="lnk"
              style={{
                textAlign: 'center',
                color: 'var(--accent-text)',
                cursor: 'pointer',
                fontWeight: 600,
              }}
              onClick={() => {
                void sendCode();
              }}
            >
              {words.t('ac_resend')}
            </button>
          )}
          <button
            type="submit"
            className="btn primary lg block"
            disabled={code.length !== CODE_LENGTH || mustRenew}
          >
            {words.t('next_step')}
          </button>
        </form>
      </PageWidth>
    );
  }

  if (step === 'details') {
    return (
      <PageWidth>
        <div>
          <h1 className="pt">{words.t('e48Details')}</h1>
          <div className="sub">{shownPhone}</div>
        </div>
        {failed ? (
          <div className="banner bad" role="alert">
            <Icon name="warn" />
            <span>{words.t('e48SendFailP')}</span>
          </div>
        ) : null}
        <form
          className="card2"
          onSubmit={(event) => {
            event.preventDefault();
            void makeAccount();
          }}
        >
          <div className="field">
            <label htmlFor="su-name">{words.t('name')}</label>
            <input
              id="su-name"
              className={tried && nameWrong ? 'input bad' : 'input'}
              autoComplete="name"
              maxLength={CUSTOMER_NAME_MAX_LENGTH}
              value={name}
              onChange={(event) => {
                setName(event.target.value);
              }}
            />
            {tried && nameWrong ? <div className="err">{words.t('err_name')}</div> : null}
          </div>
          <div className="field">
            <label htmlFor="su-password">{words.t('e48Password')}</label>
            <input
              id="su-password"
              className={tried && passwordWrong ? 'input bad' : 'input'}
              type="password"
              autoComplete="new-password"
              maxLength={PASSWORD_MAX_LENGTH}
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
              }}
            />
            {tried && passwordWrong ? (
              <div className="err">{words.t('e48PasswordBad')}</div>
            ) : (
              <div className="help">{words.t('e48PasswordHelp')}</div>
            )}
          </div>
          <button
            type="submit"
            className="btn primary lg block"
            disabled={sending}
            aria-busy={sending}
          >
            {words.t('e48Create')}
          </button>
        </form>
      </PageWidth>
    );
  }

  return (
    <PageWidth>
      <div>
        <h1 className="pt">{words.t('e48SignupT')}</h1>
        <div className="sub">{words.t('e48SignupP')}</div>
      </div>
      {refusal === 'taken' ? (
        <div className="banner warn" role="alert">
          <Icon name="warn" />
          <span>
            <b>{words.t('e48TakenT')}</b>
            <br />
            {words.t('e48TakenP')}
          </span>
        </div>
      ) : refusal === 'nosend' ? (
        <div className="banner warn" role="alert">
          <Icon name="warn" />
          <span>
            <b>{words.t('e48NoSendT')}</b>
            <br />
            {words.t('e48NoSendP')}
          </span>
        </div>
      ) : refusal === 'busy' ? (
        <div className="banner warn" role="alert">
          <Icon name="warn" />
          <span>
            <b>{words.t('e48BusyT')}</b>
            <br />
            {words.t('e48BusyP')}
          </span>
        </div>
      ) : refusal === 'failed' ? (
        <div className="banner bad" role="alert">
          <Icon name="warn" />
          <span>
            <b>{words.t('e48SendFailT')}</b>
            <br />
            {words.t('e48SendFailP')}
          </span>
        </div>
      ) : null}
      <form
        className="card2"
        onSubmit={(event) => {
          event.preventDefault();
          void sendCode();
        }}
      >
        <div className="field">
          <label htmlFor="su-phone">{words.t('phone_')}</label>
          <input
            id="su-phone"
            className={badPhone ? 'input bad' : 'input'}
            inputMode="tel"
            autoComplete="tel-national"
            placeholder="01XXXXXXXXX"
            value={phone}
            onChange={(event) => {
              setPhone(event.target.value);
              setBadPhone(false);
              setRefusal(null);
            }}
          />
          {badPhone ? <div className="err">{words.t('err_phone')}</div> : null}
        </div>
        <button
          type="submit"
          className="btn primary lg block"
          disabled={sending}
          aria-busy={sending}
        >
          {words.t('e48SendCode')}
        </button>
      </form>
      {refusal === 'nosend' && shopPhone ? (
        <div style={{ display: 'flex', gap: 8 }}>
          <a className="btn ghost sm" href={`tel:${shopPhone}`}>
            <Icon name="phone" /> {words.t('e48CallShop')}
          </a>
        </div>
      ) : null}
      <a className="btn ghost block" href={`/sign-in?next=${encodeURIComponent(next)}`}>
        {words.t('e48HaveAcct')}
      </a>
    </PageWidth>
  );
}
