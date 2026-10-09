import { useState, type SyntheticEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { forgotPasswordSchema, verifyForgotPasswordSchema } from '@lytronix/validators';
import { AuthCard } from '@/components/auth-card';
import { Button } from '@/components/button';
import { OtpInput } from '@/components/otp-input';
import { ErrorBanner } from '@/components/error-banner';
import { useCountdown } from '@/components/use-countdown';
import { errorMessage } from '@/api/error-message';
import { tenantSession } from '@/session/tenant-session';
import type { CodeIssued, SignedInBody } from '@/types/auth';

// AUTH-19: this always lands in a must_set_password session — unlike the sign-up/sign-in verify screen,
// there's only one destination (/set-password, required), so no NextStep switch is needed here.
export function ForgotPasswordVerify(): React.JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const search = useSearch({ from: '/forgot-password/verify' });
  const [expiresInSeconds, setExpiresInSeconds] = useState(search.expiresInSeconds);
  const [resendAfterSeconds, setResendAfterSeconds] = useState(search.resendAfterSeconds);
  const [code, setCode] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const expiresIn = useCountdown(expiresInSeconds);
  const resendIn = useCountdown(resendAfterSeconds);

  const verify = useMutation({
    mutationFn: () =>
      tenantSession.client.post<SignedInBody>(
        '/auth/forgot-password/verify',
        verifyForgotPasswordSchema.parse({ phone: search.phone, code }),
      ),
    onSuccess: (data) => {
      tenantSession.setSignedIn(data.csrfToken);
      void navigate({ to: '/set-password', search: { required: true } });
    },
  });

  const resend = useMutation({
    mutationFn: () =>
      tenantSession.client.post<CodeIssued>(
        '/auth/forgot-password',
        forgotPasswordSchema.parse({ phone: search.phone }),
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
    >
      <form className="space-y-5" onSubmit={handleSubmit}>
        <OtpInput
          value={code}
          onChange={setCode}
          disabled={verify.isPending}
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
