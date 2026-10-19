import { useState, type SyntheticEvent } from 'react';
import { Link, useSearch } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useRequestSigninCode, useVerifyCode } from '@/api/auth';
import { errorMessage } from '@/api/error-message';
import { Button } from '@/components/ui/button';
import { ErrorBanner } from '@/components/ui/notice';
import { OtpInput } from '@/components/ui/otp-input';
import { StepFrame } from '@/components/ui/step-frame';
import { useCountdown } from '@/hooks/use-countdown';
import { bangladeshiPhone } from '@/lib/phone';

/** Step 1b (AUTH-05..07, 13, 14): six boxes, five-minute validity, resend after 60 s, the server's own
    wrong-code message with tries left, and the password alternative for accounts that have one. */
export function VerifyCode(): React.JSX.Element {
  const { t } = useTranslation();
  const search = useSearch({ from: '/verify-code' });
  const [expiresInSeconds, setExpiresInSeconds] = useState(search.expiresInSeconds);
  const [resendAfterSeconds, setResendAfterSeconds] = useState(search.resendAfterSeconds);
  const [code, setCode] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const expiresIn = useCountdown(expiresInSeconds);
  const resendIn = useCountdown(resendAfterSeconds);
  const verify = useVerifyCode();
  const resend = useRequestSigninCode();

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
      step="identity"
      title={t('verify.title')}
      lead={t('verify.lead', { phone: bangladeshiPhone.display(search.phone) })}
      footer={
        <div className="flex flex-wrap gap-x-5 gap-y-1">
          <Link
            to="/sign-in"
            search={{}}
            className="min-h-10 font-semibold text-brand-800 underline"
          >
            {t('verify.changeNumber')}
          </Link>
          <Link
            to="/sign-in"
            search={{}}
            className="min-h-10 font-semibold text-neutral-700 underline"
          >
            {t('verify.usePassword')}
          </Link>
        </div>
      }
    >
      <form className="space-y-5" onSubmit={handleSubmit}>
        <OtpInput
          value={code}
          onChange={setCode}
          disabled={verify.isPending}
          error={formError ?? (expiresIn === 0 ? t('verify.expired') : undefined)}
        />
        {expiresIn > 0 ? (
          <p className="num text-center text-[14px] text-neutral-700">
            {t('verify.validFor', { minutes: Math.ceil(expiresIn / 60) })}
          </p>
        ) : null}
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
