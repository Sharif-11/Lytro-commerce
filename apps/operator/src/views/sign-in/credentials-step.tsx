import { useEffect, useState, type SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiClientError, errorMessage } from '@lytronix/api-client';
import { Button, ErrorBanner, TextField } from '@lytronix/ui';
import type { Credentials } from '@/api/operator-auth';
import { Banner } from '@/components/ui/banner';
import { FormCard, StepHeading } from './sign-in-parts';

interface CredentialsStepProps {
  initialEmail: string;
  onSubmit: (credentials: Credentials) => void;
  onEmailEdit: () => void;
  pending: boolean;
  error: unknown;
  locked: boolean;
}

/** Step 1 (ADM-01): email and password. A wrong one says only that the pair isn't right. */
export function CredentialsStep({
  initialEmail,
  onSubmit,
  onEmailEdit,
  pending,
  error,
  locked,
}: CredentialsStepProps): React.JSX.Element {
  const { t } = useTranslation();
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (locked) setPassword('');
  }, [locked]);

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    onSubmit({ email: email.trim(), password });
  }

  const refused = locked ? null : error;
  const wrongPair = refused instanceof ApiClientError && refused.status === 401;

  return (
    <>
      <StepHeading title={t('signIn.title')} lead={t('signIn.lead')} />
      {locked ? (
        <Banner tone="bad" icon="clock">
          <b className="font-semibold">{t('signIn.lockedTitle')}</b>
          <div>{t('signIn.locked')}</div>
        </Banner>
      ) : null}
      <FormCard onSubmit={handleSubmit}>
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
            // The lock is one account's: another address may try.
            onEmailEdit();
          }}
        />
        <TextField
          label={t('signIn.password')}
          name="password"
          type="password"
          autoComplete="current-password"
          required
          error={wrongPair ? errorMessage(refused, t) : undefined}
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
          }}
        />
        {refused && !wrongPair ? <ErrorBanner message={errorMessage(refused, t)} /> : null}
        <Button
          type="submit"
          small
          disabled={locked}
          loading={pending}
          className="disabled:opacity-45!"
        >
          {locked ? t('signIn.lockedWait') : t('common.continue')}
        </Button>
      </FormCard>
      <div className="text-[13px] leading-[1.55] text-fg-muted">{t('signIn.noRecovery')}</div>
    </>
  );
}
