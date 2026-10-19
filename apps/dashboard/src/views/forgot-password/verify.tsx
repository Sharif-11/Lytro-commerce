import { useState, type SyntheticEvent } from 'react';
import { Link, useSearch } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useResendPasswordReset, useVerifyForgotPassword } from '@/api/auth';
import { errorMessage } from '@/api/error-message';
import { Button } from '@/components/ui/button';
import { ErrorBanner } from '@/components/ui/notice';
import { OtpInput } from '@/components/ui/otp-input';
import { StepFrame } from '@/components/ui/step-frame';
import { useCountdown } from '@/hooks/use-countdown';
import { bangladeshiPhone } from '@/lib/phone';

/** AUTH-18/19: the reset code; success opens a must-set-password session. */
export function ForgotPasswordVerify(): React.JSX.Element {
  const { t } = useTranslation();
  const search = useSearch({ from: '/forgot-password/verify' });
  const [expiresInSeconds, setExpiresInSeconds] = useState(search.expiresInSeconds);
  const [resendAfterSeconds, setResendAfterSeconds] = useState(search.resendAfterSeconds);
  const [code, setCode] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const expiresIn = useCountdown(expiresInSeconds);
  const resendIn = useCountdown(resendAfterSeconds);
  const verify = useVerifyForgotPassword();
  const resend = useResendPasswordReset();

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setFormError(t('verify.invalidCode'));
      return;
    }
    setFormError(null);
    verify.mutate({ phone: search.phone, code });
  }

  return (
    <StepFrame
      title={t('forgotPassword.verifyTitle')}
      lead={t('verify.lead', { phone: bangladeshiPhone.display(search.phone) })}
      footer={
        <Link
          to="/forgot-password"
          className="inline-flex min-h-10 items-center font-semibold text-brand-800 underline"
        >
          {t('verify.changeNumber')}
        </Link>
      }
    >
      <form className="space-y-5" onSubmit={handleSubmit}>
        <OtpInput
          value={code}
          onChange={setCode}
          disabled={verify.isPending}
          error={formError ?? (expiresIn === 0 ? t('verify.expired') : undefined)}
        />
        {verify.isError ? <ErrorBanner message={errorMessage(verify.error, t)} /> : null}
        <Button type="submit" loading={verify.isPending} disabled={expiresIn === 0}>
          {t('verify.submit')}
        </Button>
        <Button
          type="button"
          tone="ghost"
          disabled={resendIn > 0 || resend.isPending}
          onClick={() => {
            resend.mutate(search.phone, {
              onSuccess: (data) => {
                setCode('');
                setExpiresInSeconds(data.expiresInSeconds);
                setResendAfterSeconds(data.resendAfterSeconds);
              },
            });
          }}
        >
          {resendIn > 0 ? t('verify.resendIn', { seconds: resendIn }) : t('verify.resend')}
        </Button>
        {resend.isError ? <ErrorBanner message={errorMessage(resend.error, t)} /> : null}
      </form>
    </StepFrame>
  );
}
