import { useState, type SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { Credentials } from '@/api/operator-auth';
import { Button } from '@/components/ui/button';
import { ErrorBanner } from '@/components/ui/notice';
import { TextField } from '@/components/ui/text-field';

interface CredentialsStepProps {
  onSubmit: (credentials: Credentials) => void;
  pending: boolean;
  error: string | null;
}

/** Step 1 (ADM-01): email and password. */
export function CredentialsStep({
  onSubmit,
  pending,
  error,
}: CredentialsStepProps): React.JSX.Element {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    onSubmit({ email: email.trim(), password });
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <TextField
        label={t('signIn.email')}
        name="email"
        type="email"
        autoComplete="username"
        inputMode="email"
        required
        value={email}
        onChange={(event) => {
          setEmail(event.target.value);
        }}
      />
      <TextField
        label={t('signIn.password')}
        name="password"
        type="password"
        autoComplete="current-password"
        required
        value={password}
        onChange={(event) => {
          setPassword(event.target.value);
        }}
      />
      {error ? <ErrorBanner message={error} /> : null}
      <Button type="submit" loading={pending}>
        {t('common.continue')}
      </Button>
    </form>
  );
}
