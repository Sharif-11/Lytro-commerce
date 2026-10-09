import { useState, type SyntheticEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { requestSigninCodeSchema, verifySigninCodeSchema } from '@lytronix/validators';
import { AuthCard } from '@/components/auth-card';
import { Button } from '@/components/button';
import { TextField } from '@/components/text-field';
import { ErrorBanner } from '@/components/error-banner';
import { useCountdown } from '@/components/use-countdown';
import { errorMessage } from '@/api/error-message';
import { tenantSession } from '@/session/tenant-session';
import { navigateForNextStep } from '@/session/next-step';
import type { CodeIssued, SignedInBody } from '@/types/auth';

export function VerifyCode(): React.JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const search = useSearch({ from: '/verify-code' });
  const [expiresInSeconds, setExpiresInSeconds] = useState(search.expiresInSeconds);
  const [resendAfterSeconds, setResendAfterSeconds] = useState(search.resendAfterSeconds);
  const [code, setCode] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const expiresIn = useCountdown(expiresInSeconds);
  const resendIn = useCountdown(resendAfterSeconds);

  const verify = useMutation({
    mutationFn: () =>
      tenantSession.client.post<SignedInBody>(
        '/auth/phone/verify',
        verifySigninCodeSchema.parse({ phone: search.phone, code }),
      ),
    onSuccess: (data) => {
      tenantSession.setSignedIn(data.csrfToken);
      navigateForNextStep(navigate, data.next);
    },
  });

  const resend = useMutation({
    mutationFn: () =>
      tenantSession.client.post<CodeIssued>(
        '/auth/phone/code',
        requestSigninCodeSchema.parse({ phone: search.phone }),
      ),
    onSuccess: (data) => {
      setExpiresInSeconds(data.expiresInSeconds);
      setResendAfterSeconds(data.resendAfterSeconds);
    },
  });

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setFormError(t('auth.verify.invalidCode'));
      return;
    }
    setFormError(null);
    verify.mutate();
  }

  return (
    <AuthCard
      title={t('auth.verify.title')}
      subtitle={t('auth.verify.subtitle', { phone: search.phone })}
      footer={
        <Link to="/sign-in" className="text-brand-700 hover:underline">
          {t('auth.verify.changeNumber')}
        </Link>
      }
    >
      <form className="space-y-4" onSubmit={handleSubmit}>
        <TextField
          label={t('auth.verify.codeLabel')}
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          className="text-center text-2xl tracking-widest"
          value={code}
          onChange={(event) => {
            setCode(event.target.value.replace(/\D/g, ''));
          }}
          error={formError ?? (expiresIn === 0 ? t('auth.verify.expired') : undefined)}
        />
        {expiresIn > 0 ? (
          <p className="text-center text-sm text-slate-500">
            {t('auth.verify.expiresIn', { seconds: expiresIn })}
          </p>
        ) : null}
        {verify.isError ? <ErrorBanner message={errorMessage(verify.error, t)} /> : null}
        <Button type="submit" loading={verify.isPending} disabled={expiresIn === 0}>
          {t('auth.verify.submit')}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={resendIn > 0 || resend.isPending}
          onClick={() => {
            resend.mutate();
          }}
        >
          {resendIn > 0
            ? t('auth.verify.resendIn', { seconds: resendIn })
            : t('auth.verify.resend')}
        </Button>
        {resend.isError ? <ErrorBanner message={errorMessage(resend.error, t)} /> : null}
      </form>
    </AuthCard>
  );
}
