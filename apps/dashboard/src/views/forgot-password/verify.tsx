import { useState, type SyntheticEvent } from 'react';
import { Link, useSearch } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useResendPasswordReset, useVerifyForgotPassword } from '@/api/auth';
import { OnboardingFrame, StepLinks } from '@/components/onboarding/frame';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { CodeBoxes } from '@/components/ui/code-boxes';
import { useCountdown } from '@/hooks/use-countdown';
import { useErrorText } from '@/hooks/use-error-text';
import { bangladeshiPhone } from '@/lib/phone';

/** AUTH-18 and AUTH-19 (the prototype's `ob-forgot-code`): the reset code; it opens a session that must set a password. */
export function ForgotPasswordVerify(): React.JSX.Element {
  const { t } = useTranslation('onboarding');
  const errorText = useErrorText();
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
      setFormError(t('invalidCode'));
      return;
    }
    setFormError(null);
    verify.mutate({ phone: search.phone, code });
  }

  const boxesError =
    formError ??
    (verify.isError ? errorText(verify.error) : null) ??
    (expiresIn === 0 ? t('codeExpired') : null);

  return (
    <OnboardingFrame
      title={t('fpVerify')}
      lead={t('vLead', { phone: bangladeshiPhone.international(search.phone) })}
    >
      <form className="flex flex-col gap-3.5" onSubmit={handleSubmit} noValidate>
        <CodeBoxes
          value={code}
          onChange={(next) => {
            setCode(next);
            setFormError(null);
          }}
          error={boxesError}
          disabled={verify.isPending}
          label={t('fpVerify')}
        />
        {boxesError ? null : (
          <p className="text-[14px] text-fg-muted">
            {t('vValid', { minutes: Math.ceil(search.expiresInSeconds / 60) })}
          </p>
        )}
        <Button type="submit" wide busy={verify.isPending} disabled={expiresIn === 0}>
          {t('vSubmit')}
        </Button>
      </form>
      <StepLinks>
        {resendIn > 0 ? (
          <span className="num text-fg-muted">{t('vResendIn', { s: resendIn })}</span>
        ) : (
          <button
            type="button"
            disabled={resend.isPending}
            onClick={() => {
              resend.mutate(search.phone, {
                onSuccess: (data) => {
                  setCode('');
                  verify.reset();
                  setExpiresInSeconds(data.expiresInSeconds);
                  setResendAfterSeconds(data.resendAfterSeconds);
                },
              });
            }}
          >
            {t('vResend')}
          </button>
        )}
        <Link to="/sign-in" search={{}}>
          {t('backSignIn')}
        </Link>
      </StepLinks>
      {resend.isError ? <Banner tone="bad">{errorText(resend.error)}</Banner> : null}
    </OnboardingFrame>
  );
}
