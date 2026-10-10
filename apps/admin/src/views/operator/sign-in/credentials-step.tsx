import { useState, type SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/button';
import { TextField } from '@/components/text-field';
import { ErrorBanner } from '@/components/error-banner';
import { LockIcon, MailIcon } from '@/components/icons';

interface CredentialsStepProps {
  onSubmit: (email: string, password: string) => void;
  pending: boolean;
  error: string | null;
}

/** Step 1 of 2/3 (ADM-01): email + password only, re-asserted again at enroll/verify — there is no
    intermediate "pending" session, so this screen never caches the password anywhere beyond its own
    in-memory form state, and never passes it through a URL. */
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
    onSubmit(email, password);
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <TextField
        label={t('common.email')}
        name="email"
        type="email"
        autoComplete="email"
        icon={<MailIcon />}
        value={email}
        onChange={(event) => {
          setEmail(event.target.value);
        }}
      />
      <TextField
        label={t('auth.signIn.passwordLabel')}
        name="password"
        type="password"
        autoComplete="current-password"
        icon={<LockIcon />}
        value={password}
        onChange={(event) => {
          setPassword(event.target.value);
        }}
      />
      {error ? <ErrorBanner message={error} /> : null}
      <Button type="submit" loading={pending}>
        {t('operator.signIn.submit')}
      </Button>
    </form>
  );
}
