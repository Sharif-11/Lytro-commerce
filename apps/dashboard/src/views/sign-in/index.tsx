import { useEffect, useState, type SyntheticEvent } from 'react';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { OauthProvider } from '@lytronix/validators';
import {
  useOauthProviders,
  useRequestSigninCode,
  useSignInWithPassword,
  useStartOauth,
} from '@/api/auth';
import { useBillingTerms, usePlans } from '@/api/billing';
import { errorMessage } from '@/api/error-message';
import { FacebookIcon, GoogleIcon } from '@/components/brand/oauth-icons';
import { Button } from '@/components/ui/button';
import { Tag } from '@/components/ui/chip';
import { Icon } from '@/components/ui/icon';
import { ErrorBanner } from '@/components/ui/notice';
import { StepFrame } from '@/components/ui/step-frame';
import { TextField } from '@/components/ui/text-field';
import { appConfig } from '@/lib/app-config';
import { bangladeshiPhone } from '@/lib/phone';
import { signUpIntent, type SignUpIntent } from '@/session/sign-up-intent';

const OAUTH_LABEL_KEY: Record<OauthProvider, string> = {
  [OauthProvider.Google]: 'signIn.continueWithGoogle',
  [OauthProvider.Facebook]: 'signIn.continueWithFacebook',
};

const OAUTH_ICON: Record<OauthProvider, React.JSX.Element> = {
  [OauthProvider.Google]: <GoogleIcon />,
  [OauthProvider.Facebook]: <FacebookIcon />,
};

/**
 * Step 1, identity (AUTH-28): one door for new and returning people (AUTH-12). Phone with a fixed +880,
 * Google, Facebook; the terms line (LEG-01) and the staff link (AUTH-31) under the buttons; what the guest
 * brought from the marketing site shown as reminders and kept for steps 2 and 2b (AUTH-29).
 */
export function SignIn(): React.JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const search = useSearch({ from: '/sign-in' });
  const [mode, setMode] = useState<'code' | 'password'>('code');
  const [localPhone, setLocalPhone] = useState('');
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
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
      setFormError(t('signIn.invalidPhone'));
      return;
    }
    setFormError(null);
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

  return (
    <StepFrame
      step="identity"
      title={t('signIn.title')}
      lead={t('signIn.lead')}
      footer={
        <div className="space-y-3">
          <p>
            {t('signIn.termsBefore')}{' '}
            <a href={appConfig.termsUrl()} className="font-semibold text-brand-800 underline">
              {t('signIn.terms')}
            </a>{' '}
            {t('signIn.termsAnd')}{' '}
            <a href={appConfig.privacyUrl()} className="font-semibold text-brand-800 underline">
              {t('signIn.privacy')}
            </a>
            {t('signIn.termsAfter')}
          </p>
          <Link
            to="/staff-sign-in"
            className="inline-flex min-h-10 items-center font-semibold text-brand-800 underline"
          >
            {t('signIn.staffLink')}
          </Link>
        </div>
      }
    >
      <IntentReminders intent={intent} />

      <form className="space-y-4" onSubmit={handleSubmit}>
        <TextField
          label={t('signIn.phoneLabel')}
          name="phone"
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          placeholder="1XXXXXXXXX"
          leading="+880"
          value={localPhone}
          onChange={(event) => {
            setLocalPhone(event.target.value.replace(/[^\d\s-]/g, ''));
          }}
          error={formError ?? undefined}
        />
        {mode === 'password' ? (
          <TextField
            label={t('signIn.passwordLabel')}
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
            }}
          />
        ) : null}
        {error ? <ErrorBanner message={errorMessage(error, t)} /> : null}
        <Button type="submit" loading={pending}>
          {mode === 'password' ? t('signIn.signInWithPassword') : t('signIn.continue')}
        </Button>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[14px]">
          <button
            type="button"
            className="min-h-10 font-semibold text-brand-800 underline"
            onClick={() => {
              setMode(mode === 'password' ? 'code' : 'password');
              setFormError(null);
            }}
          >
            {mode === 'password' ? t('signIn.useCodeInstead') : t('signIn.usePasswordInstead')}
          </button>
          {mode === 'password' ? (
            <Link
              to="/forgot-password"
              className="min-h-10 font-semibold text-neutral-700 underline"
            >
              {t('signIn.forgotPassword')}
            </Link>
          ) : null}
        </div>
        {mode === 'code' ? (
          <p className="text-[13px] text-neutral-700">{t('signIn.freeSmsNote')}</p>
        ) : null}
      </form>

      {providers.data && providers.data.providers.length > 0 ? (
        <>
          <div className="my-5 flex items-center gap-3 text-[13px] font-semibold text-neutral-700">
            <span className="h-px flex-1 bg-line-strong" />
            {t('signIn.or')}
            <span className="h-px flex-1 bg-line-strong" />
          </div>
          <div className="space-y-3">
            {providers.data.providers.map((provider) => (
              <Button
                key={provider}
                type="button"
                tone="outline"
                loading={startOauth.isPending && startOauth.variables === provider}
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
    </StepFrame>
  );
}

/** The claimed address and the picked plan, display only here (ONBOARDING-FLOW-DESIGN §2 step 1). */
function IntentReminders({ intent }: { intent: SignUpIntent }): React.JSX.Element | null {
  const { t, i18n } = useTranslation();
  const plans = usePlans();
  const terms = useBillingTerms();
  if (!intent.shop && !intent.planId) return null;

  const plan = plans.data?.find((item) => item.id === intent.planId) ?? null;
  const term = terms.data?.find((item) => item.id === intent.termId) ?? null;

  return (
    <div className="mb-5 flex flex-wrap gap-2">
      {intent.shop ? (
        <Tag tone="brand">
          <Icon name="store" size={14} />
          {t('signIn.heldAddress', { host: appConfig.shopHost(intent.shop) })}
        </Tag>
      ) : null}
      {plan ? (
        <Tag tone="accent">
          <Icon name="tag" size={14} />
          {t('signIn.pickedPlan', {
            plan: plan.name,
            term: term ? (i18n.language === 'bn' ? term.labelBn : term.labelEn) : '',
          })}
        </Tag>
      ) : null}
    </div>
  );
}
