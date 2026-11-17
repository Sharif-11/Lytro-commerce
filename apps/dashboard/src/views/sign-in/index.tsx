import { useEffect, useState, type SyntheticEvent } from 'react';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { Trans, useTranslation } from 'react-i18next';
import { ApiClientError } from '@lytronix/api-client';
import { OauthProvider } from '@lytronix/validators';
import {
  useOauthProviders,
  useRequestSigninCode,
  useSignInWithPassword,
  useStartOauth,
} from '@/api/auth';
import { FacebookIcon, GoogleIcon } from '@/components/brand/oauth-icons';
import { ErrorBanner } from '@/components/error-banner';
import { OnboardingFrame, StepLinks } from '@/components/onboarding/frame';
import { IntentChips } from '@/components/onboarding/intent-chips';
import { Button } from '@/components/ui/button';
import { CheckBox } from '@/components/ui/check-row';
import { Field } from '@/components/ui/field';
import { appConfig } from '@/lib/app-config';
import { bangladeshiPhone } from '@/lib/phone';
import { signUpIntent, type SignUpIntent } from '@/session/sign-up-intent';

const OAUTH_LABEL_KEY: Record<OauthProvider, 'google' | 'facebook'> = {
  [OauthProvider.Google]: 'google',
  [OauthProvider.Facebook]: 'facebook',
};

const OAUTH_ICON: Record<OauthProvider, React.JSX.Element> = {
  [OauthProvider.Google]: <GoogleIcon />,
  [OauthProvider.Facebook]: <FacebookIcon />,
};

/** The local part a `+880…` number carries, for the field's fixed prefix. */
function localPartOf(phone: string | undefined): string {
  return phone ? phone.replace(/\D/g, '').replace(/^880/, '').replace(/^0/, '') : '';
}

/**
 * Step 1, identity (AUTH-28; TENANT-DASHBOARD-DESIGN §6, the prototype's `ob-signin`): one door for new and returning
 * people (AUTH-12). A phone with the fixed +880 and a code, or a password; Google and Facebook where the server has
 * them; the terms box (LEG-01) and the staff link (AUTH-31). What the guest brought from the website shows as chips
 * and is kept for create-shop and the checkout (AUTH-29).
 *
 * LEG-01 (the owner, 2026-11-17): accepting the terms and the privacy policy is a box, ticked when the page opens.
 * Nothing goes on while it's unticked -- the code, the password and Google or Facebook all wait for it -- and a line
 * under it says why.
 */
export function SignIn(): React.JSX.Element {
  const { t } = useTranslation('onboarding');
  const navigate = useNavigate();
  const search = useSearch({ from: '/sign-in' });
  const [mode, setMode] = useState<'code' | 'password'>(search.mode ?? 'code');
  const [localPhone, setLocalPhone] = useState(() => localPartOf(search.phone));
  const [password, setPassword] = useState('');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(true);
  const [intent, setIntent] = useState<SignUpIntent>(() => signUpIntent.read());

  // Captured once here, the one shared entry point, then read back after create-shop.
  useEffect(() => {
    setIntent(
      signUpIntent.capture({
        shop: search.shop ?? null,
        planId: search.planId ?? null,
        termId: search.termId ?? null,
      }),
    );
  }, [search.shop, search.planId, search.termId]);

  const providers = useOauthProviders();
  const startOauth = useStartOauth();
  const requestCode = useRequestSigninCode();
  const signInWithPassword = useSignInWithPassword();

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!agreed) return;
    const phone = bangladeshiPhone.fromLocalPart(localPhone);
    if (!bangladeshiPhone.isValid(phone)) {
      setPhoneError(t('invalidPhone'));
      return;
    }
    setPhoneError(null);
    if (mode === 'password') {
      signInWithPassword.mutate({ phone, password });
      return;
    }
    requestCode.mutate(phone, {
      onSuccess: (data) => {
        void navigate({
          to: '/verify-code',
          search: {
            phone,
            expiresInSeconds: data.expiresInSeconds,
            resendAfterSeconds: data.resendAfterSeconds,
          },
        });
      },
    });
  }

  const pending = mode === 'password' ? signInWithPassword.isPending : requestCode.isPending;
  const error = mode === 'password' ? signInWithPassword.error : requestCode.error;
  // D7-24 (Part 37's `p37-signin-cantpay`): the shop's balance can't pay for the code, so a password is the way in.
  const cantPay =
    mode === 'code' && error instanceof ApiClientError && error.code === 'quota_exceeded';
  const offered = providers.data?.providers ?? [];

  return (
    <OnboardingFrame title={t('obWelcome')} lead={t('obLead')}>
      {mode === 'code' ? <IntentChips intent={intent} /> : null}
      <form className="flex flex-col gap-3.5" onSubmit={handleSubmit} noValidate>
        <Field
          label={t('phoneLabel')}
          name="phone"
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          prefix="+880"
          placeholder="1XXXXXXXXX"
          value={localPhone}
          error={phoneError}
          invalid={cantPay}
          onChange={(event) => {
            setLocalPhone(event.target.value.replace(/[^\d\s-]/g, ''));
            requestCode.reset();
          }}
        />
        {mode === 'password' ? (
          <Field
            label={t('passwordLabel')}
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
            }}
          />
        ) : null}
        {error ? <ErrorBanner error={error} /> : null}
        <div className="flex flex-col gap-1">
          <label className="flex cursor-pointer items-start gap-2.5 text-[14px] leading-[1.6] [&_a]:font-medium [&_a]:text-primary [&_a]:underline">
            <span className="pt-px">
              <CheckBox
                checked={agreed}
                onChange={() => {
                  setAgreed(!agreed);
                }}
              />
            </span>
            <span>
              <Trans
                t={t}
                i18nKey="terms"
                components={{
                  terms: (
                    <a href={appConfig.termsUrl()} target="_blank" rel="noopener noreferrer" />
                  ),
                  privacy: (
                    <a href={appConfig.privacyUrl()} target="_blank" rel="noopener noreferrer" />
                  ),
                }}
              />
            </span>
          </label>
          {agreed ? null : (
            <p role="alert" className="text-[14px] text-danger">
              {t('termsNeeded')}
            </p>
          )}
        </div>
        {cantPay ? (
          <Button
            wide
            onClick={() => {
              setMode('password');
              requestCode.reset();
            }}
          >
            {t('usePw')}
          </Button>
        ) : (
          <Button type="submit" wide busy={pending} disabled={!agreed}>
            {mode === 'password' ? t('signInPw') : t('cont')}
          </Button>
        )}
      </form>
      <StepLinks>
        {cantPay ? (
          <button
            type="button"
            onClick={() => {
              setLocalPhone('');
              requestCode.reset();
            }}
          >
            {t('vChange')}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              setMode(mode === 'password' ? 'code' : 'password');
              setPhoneError(null);
            }}
          >
            {mode === 'password' ? t('useCode') : t('usePw')}
          </button>
        )}
        {mode === 'password' ? <Link to="/forgot-password">{t('forgotPw')}</Link> : null}
      </StepLinks>
      {mode === 'code' ? <p className="text-[14px] text-fg-muted">{t('freeSmsNote')}</p> : null}
      {offered.length > 0 ? (
        <>
          <div className="flex items-center gap-3 text-[13px] text-fg-subtle before:h-px before:flex-1 before:bg-line after:h-px after:flex-1 after:bg-line">
            {t('or')}
          </div>
          <div className="flex flex-col gap-2">
            {offered.map((provider) => (
              <Button
                key={provider}
                tone="outline"
                wide
                className="justify-start gap-3"
                busy={startOauth.isPending && startOauth.variables === provider}
                disabled={startOauth.isPending || !agreed}
                onClick={() => {
                  startOauth.mutate(provider);
                }}
              >
                {OAUTH_ICON[provider]}
                {t(OAUTH_LABEL_KEY[provider])}
              </Button>
            ))}
          </div>
        </>
      ) : null}
      <StepLinks>
        <Link to="/staff-sign-in">{t('staffLink')}</Link>
      </StepLinks>
    </OnboardingFrame>
  );
}
