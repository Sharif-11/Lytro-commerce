'use client';

import {
  CUSTOMER_NAME_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '@lytronix/validators/common';
import { useEffect, useMemo, useState } from 'react';
import { type Language, Words } from '@/lib/i18n/words';
import { Icon } from '../icon';
import { shopperRequest } from './shopper-request';

type Toast = 'saved' | 'password' | null;

/** CUS-05 (`e48-profile`): the name, the phone which can't change, and Change password, which ends the shopper's other
    sign-ins. */
export function ProfileView({
  language,
  name: firstName,
  phone,
}: {
  language: Language;
  name: string;
  phone: string;
}) {
  const words = useMemo(() => new Words(language), [language]);
  const [name, setName] = useState(firstName);
  const [nameWrong, setNameWrong] = useState(false);
  const [current, setCurrent] = useState('');
  const [fresh, setFresh] = useState('');
  const [currentWrong, setCurrentWrong] = useState(false);
  const [freshWrong, setFreshWrong] = useState(false);
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [toast, setToast] = useState<Toast>(null);

  useEffect(() => {
    if (toast === null) return;
    const timer = setTimeout(() => {
      setToast(null);
    }, 3000);
    return () => {
      clearTimeout(timer);
    };
  }, [toast]);

  const saveName = async () => {
    const wrong = name.trim() === '';
    setNameWrong(wrong);
    if (wrong || sending) return;
    setSending(true);
    setFailed(false);
    const answer = await shopperRequest('PATCH', 'me', { name: name.trim() });
    setSending(false);
    if (answer.status === 200) setToast('saved');
    else setFailed(true);
  };

  const changePassword = async () => {
    const wrongFresh = fresh.length < PASSWORD_MIN_LENGTH || fresh.length > PASSWORD_MAX_LENGTH;
    const noCurrent = current === '';
    setFreshWrong(wrongFresh);
    setCurrentWrong(noCurrent);
    if (wrongFresh || noCurrent || sending) return;
    setSending(true);
    setFailed(false);
    const answer = await shopperRequest('POST', 'password', {
      currentPassword: current,
      newPassword: fresh,
    });
    setSending(false);
    if (answer.status === 200) {
      setCurrent('');
      setFresh('');
      setToast('password');
    } else if (answer.fields['currentPassword']) {
      setCurrentWrong(true);
    } else {
      setFailed(true);
    }
  };

  return (
    <>
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
          void saveName();
        }}
      >
        <div className="field">
          <label htmlFor="pf-name">{words.t('name')}</label>
          <input
            id="pf-name"
            className={nameWrong ? 'input bad' : 'input'}
            autoComplete="name"
            maxLength={CUSTOMER_NAME_MAX_LENGTH}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setNameWrong(false);
            }}
          />
          {nameWrong ? <div className="err">{words.t('err_name')}</div> : null}
        </div>
        <div className="field">
          <label htmlFor="pf-phone">{words.t('phone_')}</label>
          <input id="pf-phone" className="input" value={phone} disabled readOnly />
          <div className="help">{words.t('e48PhoneFixed')}</div>
        </div>
        <button type="submit" className="btn primary" disabled={sending}>
          {words.t('save_action')}
        </button>
      </form>
      <form
        className="card2"
        onSubmit={(event) => {
          event.preventDefault();
          void changePassword();
        }}
      >
        <h3>{words.t('e48ChangePw')}</h3>
        <div className="field">
          <label htmlFor="pf-current">{words.t('password_now')}</label>
          <input
            id="pf-current"
            className={currentWrong ? 'input bad' : 'input'}
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(event) => {
              setCurrent(event.target.value);
              setCurrentWrong(false);
            }}
          />
          {currentWrong ? <div className="err">{words.t('e48PwWrong')}</div> : null}
        </div>
        <div className="field">
          <label htmlFor="pf-new">{words.t('password_new')}</label>
          <input
            id="pf-new"
            className={freshWrong ? 'input bad' : 'input'}
            type="password"
            autoComplete="new-password"
            maxLength={PASSWORD_MAX_LENGTH}
            value={fresh}
            onChange={(event) => {
              setFresh(event.target.value);
              setFreshWrong(false);
            }}
          />
          {freshWrong ? (
            <div className="err">{words.t('e48PasswordBad')}</div>
          ) : (
            <div className="help">{words.t('e48PasswordHelp')}</div>
          )}
        </div>
        <button type="submit" className="btn ghost" disabled={sending}>
          {words.t('e48ChangePw')}
        </button>
      </form>
      {toast ? (
        <div className="toast" role="status">
          <Icon name="check" />
          <span>{words.t(toast === 'saved' ? 'e48Saved' : 'e48PwChanged')}</span>
        </div>
      ) : null}
    </>
  );
}
