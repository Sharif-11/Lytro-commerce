import { useState, type SyntheticEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { forgotPasswordSchema } from '@lytronix/validators';
import { AuthCard } from '@/components/auth-card';
import { Button } from '@/components/button';
import { TextField } from '@/components/text-field';
import { ErrorBanner } from '@/components/error-banner';
import { errorMessage } from '@/api/error-message';
import { isValidBdPhone } from '@/api/phone';
import { tenantSession } from '@/session/tenant-session';
import type { CodeIssued } from '@/types/auth';

// AUTH-17: phone-only, and the success reply is identical whether or not the phone has an account — don't
// leak account existence through a different message or a different response shape.
export function ForgotPassword(): React.JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [phone, setPhone] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (value: string) =>
      tenantSession.client.post<CodeIssued>(
        '/auth/forgot-password',
        forgotPasswordSchema.parse({ phone: value }),
      ),
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

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!isValidBdPhone(phone)) {
      setFormError(t('auth.signIn.invalidPhone'));
      return;
    }
    setFormError(null);
    mutation.mutate(phone);
  }

  return (
    <AuthCard
      title={t('auth.forgotPassword.title')}
      subtitle={t('auth.forgotPassword.subtitle')}
      footer={
        <Link to="/sign-in" className="text-brand-700 hover:underline">
          {t('auth.forgotPassword.backToSignIn')}
        </Link>
      }
    >
      <form className="space-y-4" onSubmit={handleSubmit}>
        <TextField
          label={t('auth.signIn.phoneLabel')}
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder={t('auth.signIn.phonePlaceholder')}
          value={phone}
          onChange={(event) => {
            setPhone(event.target.value);
          }}
          error={formError ?? undefined}
        />
        {mutation.isError ? <ErrorBanner message={errorMessage(mutation.error, t)} /> : null}
        <Button type="submit" loading={mutation.isPending}>
          {t('auth.forgotPassword.submit')}
        </Button>
      </form>
    </AuthCard>
  );
}
