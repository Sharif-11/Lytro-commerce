import { useState, type SyntheticEvent } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useStaffSignIn } from '@/api/auth';
import { errorMessage } from '@/api/error-message';
import { Button } from '@/components/ui/button';
import { ErrorBanner } from '@/components/ui/notice';
import { StepFrame } from '@/components/ui/step-frame';
import { TextField } from '@/components/ui/text-field';
import { bangladeshiPhone } from '@/lib/phone';

/** AUTH-31: staff sign in with their phone and the password the owner set; a forgotten password is reset by
    the owner, and the page says so. Its own endpoint and its own narrower next step. */
export function StaffSignIn(): React.JSX.Element {
  const { t } = useTranslation();
  const [localPhone, setLocalPhone] = useState('');
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const signIn = useStaffSignIn();

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    const phone = bangladeshiPhone.fromLocalPart(localPhone);
    if (!bangladeshiPhone.isValid(phone)) {
      setFormError(t('signIn.invalidPhone'));
      return;
    }
    setFormError(null);
    signIn.mutate({ phone, password });
  }

  return (
    <StepFrame
      title={t('staffSignIn.title')}
      lead={t('staffSignIn.lead')}
      footer={
        <div className="space-y-2">
          <p>{t('staffSignIn.forgotNote')}</p>
          <Link
            to="/sign-in"
            search={{}}
            className="inline-flex min-h-10 items-center font-semibold text-brand-800 underline"
          >
            {t('staffSignIn.ownerLink')}
          </Link>
        </div>
      }
    >
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
        {signIn.isError ? <ErrorBanner message={errorMessage(signIn.error, t)} /> : null}
        <Button type="submit" loading={signIn.isPending}>
          {t('signIn.signInWithPassword')}
        </Button>
      </form>
    </StepFrame>
  );
}
