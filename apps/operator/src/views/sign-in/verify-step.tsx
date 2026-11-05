import { useState, type SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '@lytronix/api-client';
import { Button } from '@lytronix/ui';
import { CodeField, FormCard, StepHeading, Steps } from './sign-in-parts';
import { typedCode } from './typed-code';

interface VerifyStepProps {
  email: string;
  onSubmit: (code: string) => void;
  onBack: () => void;
  pending: boolean;
  error: unknown;
}

/**
 * Every later sign-in (ADM-01): a TOTP code or a backup code in one field; the server tries TOTP first, and a wrong one
 * says how many tries are left. The keypad stays a full one, since a backup code has letters.
 */
export function VerifyStep({
  email,
  onSubmit,
  onBack,
  pending,
  error,
}: VerifyStepProps): React.JSX.Element {
  const { t } = useTranslation();
  const [code, setCode] = useState('');

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    onSubmit(typedCode(code));
  }

  return (
    <>
      <Steps done={2} total={2} email={email} />
      <StepHeading title={t('verify.title')} lead={t('verify.lead')} />
      <FormCard onSubmit={handleSubmit}>
        <CodeField
          label={t('verify.codeLabel')}
          value={code}
          onChange={setCode}
          error={error ? errorMessage(error, t) : undefined}
          startHere
        />
        <Button type="submit" small loading={pending}>
          {t('verify.submit')}
        </Button>
        <Button type="button" tone="ghost" small className="text-primary!" onClick={onBack}>
          {t('verify.back')}
        </Button>
      </FormCard>
    </>
  );
}
