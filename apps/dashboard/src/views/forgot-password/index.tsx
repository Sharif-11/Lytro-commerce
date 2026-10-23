import { useState, type SyntheticEvent } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useRequestPasswordReset } from '@/api/auth';
import { OnboardingFrame, StepLinks } from '@/components/onboarding/frame';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { useErrorText } from '@/hooks/use-error-text';
import { bangladeshiPhone } from '@/lib/phone';

/** AUTH-17 (the prototype's `ob-forgot`): the reply is the same whether or not the number has an account. */
export function ForgotPassword(): React.JSX.Element {
  const { t } = useTranslation('onboarding');
  const errorText = useErrorText();
  const navigate = useNavigate();
  const [localPhone, setLocalPhone] = useState('');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const request = useRequestPasswordReset();

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    const phone = bangladeshiPhone.fromLocalPart(localPhone);
    if (!bangladeshiPhone.isValid(phone)) {
      setPhoneError(t('invalidPhone'));
      return;
    }
    setPhoneError(null);
    request.mutate(phone, {
      onSuccess: (data) => {
        void navigate({
          to: '/forgot-password/verify',
          search: {
            phone,
            expiresInSeconds: data.expiresInSeconds,
            resendAfterSeconds: data.resendAfterSeconds,
          },
        });
      },
    });
  }

  return (
    <OnboardingFrame title={t('fpTitle')} lead={t('fpLead')}>
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
        {request.isError ? <Banner tone="bad">{errorText(request.error)}</Banner> : null}
        <Button type="submit" wide busy={request.isPending}>
          {t('fpSubmit')}
        </Button>
      </form>
      <p className="text-[14px] text-fg-muted">{t('fpSame')}</p>
      <StepLinks>
        <Link to="/sign-in" search={{}}>
          {t('backSignIn')}
        </Link>
      </StepLinks>
    </OnboardingFrame>
  );
}
