import { useState, type SyntheticEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { OauthProvider, passwordSigninSchema, requestSigninCodeSchema } from '@lytronix/validators';
import { AuthCard } from '@/components/auth-card';
import { Button } from '@/components/button';
import { TextField } from '@/components/text-field';
import { ErrorBanner } from '@/components/error-banner';
import { errorMessage } from '@/api/error-message';
import { isValidBdPhone } from '@/api/phone';
import { tenantSession } from '@/session/tenant-session';
import { navigateForNextStep } from '@/session/next-step';
import { GoogleIcon, FacebookIcon } from '@/components/oauth-icons';
import { LockIcon, PhoneIcon } from '@/components/icons';
import type { CodeIssued, SignedInBody } from '@/types/auth';

const OAUTH_LABEL_KEY: Record<OauthProvider, string> = {
  [OauthProvider.Google]: 'auth.signIn.continueWithGoogle',
  [OauthProvider.Facebook]: 'auth.signIn.continueWithFacebook',
};

const OAUTH_ICON: Record<OauthProvider, React.JSX.Element> = {
  [OauthProvider.Google]: <GoogleIcon />,
  [OauthProvider.Facebook]: <FacebookIcon />,
};

// AUTH-12: sign-up and sign-in share this one entry point — a verified new phone creates the account, a
// verified existing phone signs in. There is no separate "create account" screen. AUTH-24 adds Google/
// Facebook as alternate entry points into the same account model.
export function SignIn(): React.JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'code' | 'password'>('code');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const providers = useQuery({
    queryKey: ['oauth-providers'],
    queryFn: () => tenantSession.client.get<{ providers: OauthProvider[] }>('/auth/providers'),
  });

  const startOauth = useMutation({
    mutationFn: (provider: OauthProvider) =>
      tenantSession.client.get<{ url: string }>(`/auth/oauth/${provider}/start`),
    onSuccess: (data) => {
      window.location.href = data.url;
    },
  });

  const requestCode = useMutation({
    mutationFn: (value: string) =>
      tenantSession.client.post<CodeIssued>(
        '/auth/phone/code',
        requestSigninCodeSchema.parse({ phone: value }),
      ),
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

  const signInWithPassword = useMutation({
    mutationFn: () =>
      tenantSession.client.post<SignedInBody>(
        '/auth/signin',
        passwordSigninSchema.parse({ phone, password }),
      ),
    onSuccess: (data) => {
      tenantSession.setSignedIn(data.csrfToken);
      navigateForNextStep(navigate, data.next);
    },
  });

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!isValidBdPhone(phone)) {
      setFormError(t('auth.signIn.invalidPhone'));
      return;
    }
    setFormError(null);
    if (mode === 'password') {
      signInWithPassword.mutate();
    } else {
      requestCode.mutate(phone);
    }
  }

  const pending = mode === 'password' ? signInWithPassword.isPending : requestCode.isPending;
  const error = mode === 'password' ? signInWithPassword.error : requestCode.error;
  const isError = mode === 'password' ? signInWithPassword.isError : requestCode.isError;

  return (
    <AuthCard
      title={t('auth.signIn.title')}
      subtitle={t('auth.signIn.subtitle')}
      footer={
        <Link to="/forgot-password" className="text-brand-700 hover:underline">
          {t('auth.signIn.forgotPassword')}
        </Link>
      }
    >
      <div className="space-y-5">
        {providers.data && providers.data.providers.length > 0 ? (
          <>
            <div className="space-y-3">
              {providers.data.providers.map((provider) => (
                <Button
                  key={provider}
                  type="button"
                  variant="outline"
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
            <div className="flex items-center gap-3 text-xs text-slate-400">
              <span className="h-px flex-1 bg-slate-200" />
              {t('auth.signIn.orDivider')}
              <span className="h-px flex-1 bg-slate-200" />
            </div>
          </>
        ) : null}

        <form className="space-y-4" onSubmit={handleSubmit}>
          <TextField
            label={t('auth.signIn.phoneLabel')}
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder={t('auth.signIn.phonePlaceholder')}
            icon={<PhoneIcon />}
            value={phone}
            onChange={(event) => {
              setPhone(event.target.value);
            }}
            error={formError ?? undefined}
          />
          {mode === 'password' ? (
            <TextField
              label={t('auth.signIn.passwordLabel')}
              name="password"
              type="password"
              autoComplete="current-password"
              icon={<LockIcon />}
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
              }}
            />
          ) : null}
          {isError ? <ErrorBanner message={errorMessage(error, t)} /> : null}
          <Button type="submit" loading={pending}>
            {mode === 'password' ? t('auth.signIn.signInWithPassword') : t('auth.signIn.continue')}
          </Button>
          <button
            type="button"
            className="block w-full text-center text-sm text-brand-700 hover:underline"
            onClick={() => {
              setMode(mode === 'password' ? 'code' : 'password');
              setFormError(null);
            }}
          >
            {mode === 'password'
              ? t('auth.signIn.useCodeInstead')
              : t('auth.signIn.usePasswordInstead')}
          </button>
        </form>
      </div>
    </AuthCard>
  );
}
