import { useState, type SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { ErrorBanner } from '@/components/ui/notice';
import { TextField } from '@/components/ui/text-field';

interface VerifyStepProps {
  onSubmit: (code: string) => void;
  onBack: () => void;
  pending: boolean;
  error: string | null;
}

/** Every later sign-in (ADM-01): a TOTP code or a backup code in one field; the server tries TOTP first. */
export function VerifyStep({
  onSubmit,
  onBack,
  pending,
  error,
}: VerifyStepProps): React.JSX.Element {
  const { t } = useTranslation();
  const [code, setCode] = useState('');

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    onSubmit(code.trim());
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <TextField
        label={t('verify.codeLabel')}
        name="code"
        autoComplete="one-time-code"
        required
        mono
        autoFocus
        value={code}
        onChange={(event) => {
          setCode(event.target.value);
        }}
      />
      {error ? <ErrorBanner message={error} /> : null}
      <Button type="submit" loading={pending}>
        {t('verify.submit')}
      </Button>
      <Button type="button" tone="ghost" onClick={onBack}>
        {t('verify.back')}
      </Button>
    </form>
  );
}
