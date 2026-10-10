import { useState, type SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/button';
import { TextField } from '@/components/text-field';
import { ErrorBanner } from '@/components/error-banner';

interface VerifyStepProps {
  onSubmit: (code: string) => void;
  pending: boolean;
  error: string | null;
}

/** Step 2 for an already-enrolled operator (ADM-01): a TOTP code or a backup code, in the same field — the
    server tries the TOTP check first, then falls back to the backup-code list (TotpService's own note). */
export function VerifyStep({ onSubmit, pending, error }: VerifyStepProps): React.JSX.Element {
  const { t } = useTranslation();
  const [code, setCode] = useState('');

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    onSubmit(code);
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <TextField
        label={t('operator.verify.codeLabel')}
        name="code"
        inputMode="text"
        autoComplete="one-time-code"
        value={code}
        onChange={(event) => {
          setCode(event.target.value);
        }}
      />
      {error ? <ErrorBanner message={error} /> : null}
      <Button type="submit" loading={pending}>
        {t('operator.verify.submit')}
      </Button>
    </form>
  );
}
