import { useState, type SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@lytronix/validators';
import { useStaffSetPassword } from '@/api/auth';
import { errorMessage } from '@/api/error-message';
import { Button } from '@/components/ui/button';
import { ErrorBanner } from '@/components/ui/notice';
import { StepFrame } from '@/components/ui/step-frame';
import { TextField } from '@/components/ui/text-field';

/** AUTH-19 for staff (STF-13): the first sign-in, and the first after an owner reset, needs a new password
    before the shop opens. No Skip. */
export function StaffSetPassword(): React.JSX.Element {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const mutation = useStaffSetPassword();

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (
      password.length < PASSWORD_MIN_LENGTH ||
      password.length > PASSWORD_MAX_LENGTH ||
      !/\d/.test(password)
    ) {
      setFormError(t('setPassword.rulesNotMet'));
      return;
    }
    setFormError(null);
    mutation.mutate(password);
  }

  return (
    <StepFrame title={t('setPassword.titleRequired')} lead={t('staffSetPassword.lead')}>
      <form className="space-y-5" onSubmit={handleSubmit}>
        <TextField
          label={t('setPassword.newPasswordLabel')}
          name="newPassword"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
          }}
          error={formError ?? undefined}
          hint={t('setPassword.ruleLength', { min: PASSWORD_MIN_LENGTH, max: PASSWORD_MAX_LENGTH })}
        />
        {mutation.isError ? <ErrorBanner message={errorMessage(mutation.error, t)} /> : null}
        <Button type="submit" loading={mutation.isPending}>
          {t('setPassword.submit')}
        </Button>
      </form>
    </StepFrame>
  );
}
