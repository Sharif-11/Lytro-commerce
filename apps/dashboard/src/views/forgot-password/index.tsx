import { useState, type SyntheticEvent } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useRequestPasswordReset } from '@/api/auth';
import { errorMessage } from '@/api/error-message';
import { Button } from '@/components/ui/button';
import { ErrorBanner } from '@/components/ui/notice';
import { StepFrame } from '@/components/ui/step-frame';
import { TextField } from '@/components/ui/text-field';
import { bangladeshiPhone } from '@/lib/phone';

/** AUTH-17: the reply is the same whether or not the number has an account. */
export function ForgotPassword(): React.JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [localPhone, setLocalPhone] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const mutation = useRequestPasswordReset();

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    const phone = bangladeshiPhone.fromLocalPart(localPhone);
    if (!bangladeshiPhone.isValid(phone)) {
      setFormError(t('signIn.invalidPhone'));
      return;
    }
    setFormError(null);
    mutation.mutate(phone, {
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
    <StepFrame
      title={t('forgotPassword.title')}
      lead={t('forgotPassword.lead')}
      footer={
        <Link
          to="/sign-in"
          search={{}}
          className="inline-flex min-h-10 items-center font-semibold text-brand-800 underline"
        >
          {t('forgotPassword.backToSignIn')}
        </Link>
      }
    >
      <form className="space-y-5" onSubmit={handleSubmit}>
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
        {mutation.isError ? <ErrorBanner message={errorMessage(mutation.error, t)} /> : null}
        <Button type="submit" loading={mutation.isPending}>
          {t('forgotPassword.submit')}
        </Button>
      </form>
    </StepFrame>
  );
}
