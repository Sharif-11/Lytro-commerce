import { useEffect, useState, type SyntheticEvent } from 'react';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { Trans, useTranslation } from 'react-i18next';
import { OauthProvider } from '@lytronix/validators';
import {
  useOauthProviders,
  useRequestSigninCode,
  useSignInWithPassword,
  useStartOauth,
} from '@/api/auth';
import { useBillingTerms, usePlans } from '@/api/billing';
import { FacebookIcon, GoogleIcon } from '@/components/brand/oauth-icons';
import { Icon } from '@/components/icon';
import { OnboardingFrame, StepLinks } from '@/components/onboarding/frame';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { useErrorText } from '@/hooks/use-error-text';
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
 * them; the terms line (LEG-01) and the staff link (AUTH-31). What the guest brought from the website shows as chips
 * and is kept for create-shop and the checkout (AUTH-29).
 */
export function SignIn(): React.JSX.Element {
  const { t } = useTranslation('onboarding');
  const errorText = useErrorText();
  const navigate = useNavigate();
  const search = useSearch({ from: '/sign-in' });
  const [mode, setMode] = useState<'code' | 'password'>(search.mode ?? 'code');
  const [localPhone, setLocalPhone] = useState(() => localPartOf(search.phone));
  const [password, setPassword] = useState('');
  const [phoneError, setPhoneError] = useState<string | null>(null);
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
          onChange={(event) => {
            setLocalPhone(event.target.value.replace(/[^\d\s-]/g, ''));
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
        {error ? <Banner tone="bad">{errorText(error)}</Banner> : null}
        <Button type="submit" wide busy={pending}>
          {mode === 'password' ? t('signInPw') : t('cont')}
        </Button>
      </form>
      <StepLinks>
        <button
          type="button"
          onClick={() => {
            setMode(mode === 'password' ? 'code' : 'password');
            setPhoneError(null);
          }}
        >
          {mode === 'password' ? t('useCode') : t('usePw')}
        </button>
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
                disabled={startOauth.isPending}
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
      <p className="text-center text-[13px] leading-[1.6] text-fg-muted [&_a]:font-medium [&_a]:text-primary">
        <Trans
          t={t}
          i18nKey="terms"
          components={{
            terms: <a href={appConfig.termsUrl()} />,
            privacy: <a href={appConfig.privacyUrl()} />,
          }}
        />
      </p>
      <StepLinks>
        <Link to="/staff-sign-in">{t('staffLink')}</Link>
      </StepLinks>
    </OnboardingFrame>
  );
}

/**
 * What the guest chose on the website, shown as chips (ONBOARDING-FLOW-DESIGN §2 step 1): the address they typed and
 * the plan they picked. Nothing holds the address yet -- create-shop checks it -- so the chip names it and promises
 * nothing (decided 2026-10-23).
 */
function IntentChips({ intent }: { intent: SignUpIntent }): React.JSX.Element | null {
  const { t, i18n } = useTranslation('onboarding');
  const plans = usePlans();
  const terms = useBillingTerms();
  if (!intent.shop && !intent.planId) return null;

  const plan = plans.data?.find((item) => item.id === intent.planId) ?? null;
  const term = terms.data?.find((item) => item.id === intent.termId) ?? null;
  const chip =
    'inline-flex h-8 items-center gap-1.5 rounded-full border border-brand-200 bg-primary-soft px-3.5 text-[14px] font-medium text-brand-900';

  return (
    <div className="flex flex-wrap gap-2">
      {intent.shop ? (
        <span className={chip}>
          <Icon name="globe" size={16} />
          {t('yourLink', { host: appConfig.shopHost(intent.shop) })}
        </span>
      ) : null}
      {plan ? (
        <span className={chip}>
          {t('picked', {
            plan: term
              ? `${plan.name} · ${i18n.language === 'bn' ? term.labelBn : term.labelEn}`
              : plan.name,
          })}
        </span>
      ) : null}
    </div>
  );
}
