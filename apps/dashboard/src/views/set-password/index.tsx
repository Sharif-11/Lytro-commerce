import { useState, type SyntheticEvent } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { RECOVERY_NOTE_KEY, useSetPassword } from '@/api/auth';
import { OnboardingFrame, StepLinks } from '@/components/onboarding/frame';
import { Notice } from '@/components/onboarding/notice';
import { PasswordRules } from '@/components/onboarding/password-rules';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { useErrorText } from '@/hooks/use-error-text';
import { checkPassword, passesEveryRule } from '@/lib/password-rules';

function readRecoveryNote(): boolean {
  try {
    return sessionStorage.getItem(RECOVERY_NOTE_KEY) === 'facebook-only';
  } catch {
    return false;
  }
}

/**
 * Step 3 (AUTH-19, 20, 27, 28; the prototype's `ob-password`): optional, with the three rules checked as the owner
 * types, and "Skip for now" -- unless the session must set one after a reset (AUTH-19), when it is required and the
 * owner's steps are over. A Facebook-only account is told that Facebook is its only way back in.
 */
export function SetPassword(): React.JSX.Element {
  const { t } = useTranslation('onboarding');
  const errorText = useErrorText();
  const navigate = useNavigate();
  const search = useSearch({ from: '/set-password' });
  const [password, setPassword] = useState('');
  const [rulesError, setRulesError] = useState<string | null>(null);
  const facebookOnly = readRecoveryNote();
  const check = checkPassword(password);

  const goOn = (): void => {
    void navigate({ to: search.required ? '/shops' : '/set-up' });
  };
  const save = useSetPassword(goOn);

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
    <OnboardingFrame
      step={search.required ? undefined : 2}
      title={search.required ? t('pwTitleReq') : t('pwTitle')}
      lead={search.required ? t('pwLeadReq') : t('pwLead')}
    >
      {facebookOnly ? <Notice tone="warn">{t('fbOnly')}</Notice> : null}
      <form className="flex flex-col gap-3.5" onSubmit={handleSubmit} noValidate>
        <Field
          label={t('pwNew')}
          name="newPassword"
          type="password"
          autoComplete="new-password"
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
      {search.required ? null : (
        <StepLinks>
          <button type="button" onClick={goOn}>
            {t('pwSkip')}
          </button>
        </StepLinks>
      )}
    </OnboardingFrame>
  );
}
