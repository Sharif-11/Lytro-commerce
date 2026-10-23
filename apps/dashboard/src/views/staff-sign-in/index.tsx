import { useState, type SyntheticEvent } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useStaffSignIn } from '@/api/auth';
import { OnboardingFrame, StepLinks } from '@/components/onboarding/frame';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { useErrorText } from '@/hooks/use-error-text';
import { bangladeshiPhone } from '@/lib/phone';

/**
 * AUTH-31 (the prototype's `ob-staff`): staff sign in with their phone and the password the owner set; a forgotten
 * password is the owner's to reset, and the page says so. Its own endpoint, and its own narrower next step.
 */
export function StaffSignIn(): React.JSX.Element {
  const { t } = useTranslation('onboarding');
  const errorText = useErrorText();
  const [localPhone, setLocalPhone] = useState('');
  const [password, setPassword] = useState('');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const signIn = useStaffSignIn();

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    const phone = bangladeshiPhone.fromLocalPart(localPhone);
    if (!bangladeshiPhone.isValid(phone)) {
      setPhoneError(t('invalidPhone'));
      return;
    }
    setPhoneError(null);
    signIn.mutate({ phone, password });
  }

  return (
    <OnboardingFrame title={t('ssTitle')} lead={t('ssLead')}>
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
        <Field
          label={t('passwordLabel')}
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
          }}
        />
        {signIn.isError ? <Banner tone="bad">{errorText(signIn.error)}</Banner> : null}
        <Button type="submit" wide busy={signIn.isPending}>
          {t('signInPw')}
        </Button>
      </form>
      <p className="text-[14px] text-fg-muted">{t('ssForgot')}</p>
      <StepLinks>
        <Link to="/sign-in" search={{}}>
          {t('ownerLink')}
        </Link>
      </StepLinks>
    </OnboardingFrame>
  );
}
