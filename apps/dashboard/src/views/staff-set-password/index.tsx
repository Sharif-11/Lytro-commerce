import { useState, type SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useStaffSetPassword } from '@/api/auth';
import { OnboardingFrame } from '@/components/onboarding/frame';
import { PasswordRules } from '@/components/onboarding/password-rules';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { useErrorText } from '@/hooks/use-error-text';
import { checkPassword, passesEveryRule } from '@/lib/password-rules';

/**
 * AUTH-19 and AUTH-31 for staff (STF-13; the prototype's `ob-staff-password`): the first sign-in, and the first after
 * an owner's reset, needs the member's own password before the shop opens. No Skip.
 */
export function StaffSetPassword(): React.JSX.Element {
  const { t } = useTranslation('onboarding');
  const errorText = useErrorText();
  const [password, setPassword] = useState('');
  const [rulesError, setRulesError] = useState<string | null>(null);
  const save = useStaffSetPassword();
  const check = checkPassword(password);

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!passesEveryRule(check)) {
      setRulesError(t('pwRulesNotMet'));
      return;
    }
    setRulesError(null);
    save.mutate(password);
  }

  return (
    <OnboardingFrame title={t('pwTitleReq')} lead={t('staffPwLead')}>
      <form className="flex flex-col gap-3.5" onSubmit={handleSubmit} noValidate>
        <Field
          label={t('pwNew')}
          name="newPassword"
          type="password"
          autoComplete="new-password"
          placeholder="••••••••"
          value={password}
          error={rulesError}
          onChange={(event) => {
            setPassword(event.target.value);
            setRulesError(null);
          }}
        />
        <PasswordRules check={check} />
        {save.isError ? <Banner tone="bad">{errorText(save.error)}</Banner> : null}
        <Button type="submit" wide busy={save.isPending}>
          {t('pwSave')}
        </Button>
      </form>
    </OnboardingFrame>
  );
}
