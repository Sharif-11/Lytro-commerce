import { useState, type SyntheticEvent } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@lytronix/validators';
import { RECOVERY_NOTE_KEY, useSetPassword } from '@/api/auth';
import { errorMessage } from '@lytronix/api-client';
import { Button, ErrorBanner, Icon, Notice, TextField } from '@lytronix/ui';
import { StepFrame } from '@/components/ui/step-frame';

function readRecoveryNote(): boolean {
  try {
    return sessionStorage.getItem(RECOVERY_NOTE_KEY) === 'facebook-only';
  } catch {
    return false;
  }
}

/**
 * Step 3 (AUTH-28, 20, 27): optional, shown once, with the rules live; "Skip for now" unless the session
 * must set one (AUTH-19). A Facebook-only account is told that Facebook sign-in is its only way back in.
 */
export function SetPassword(): React.JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const search = useSearch({ from: '/set-password' });
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const facebookOnly = readRecoveryNote();

  const goOn = (): void => {
    void navigate({ to: search.required ? '/shops' : '/set-up' });
  };
  const mutation = useSetPassword(goOn);

  const rules = [
    {
      key: 'length',
      ok: password.length >= PASSWORD_MIN_LENGTH && password.length <= PASSWORD_MAX_LENGTH,
      label: t('setPassword.ruleLength', { min: PASSWORD_MIN_LENGTH, max: PASSWORD_MAX_LENGTH }),
    },
    { key: 'digit', ok: /\d/.test(password), label: t('setPassword.ruleDigit') },
  ];

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!rules.every((rule) => rule.ok)) {
      setFormError(t('setPassword.rulesNotMet'));
      return;
    }
    setFormError(null);
    mutation.mutate(password);
  }

  return (
    <StepFrame
      step="password"
      title={search.required ? t('setPassword.titleRequired') : t('setPassword.title')}
      lead={search.required ? t('setPassword.leadRequired') : t('setPassword.lead')}
      footer={
        search.required ? null : (
          <button
            type="button"
            className="min-h-10 font-semibold text-brand-800 underline"
            onClick={goOn}
          >
            {t('setPassword.skip')}
          </button>
        )
      }
    >
      {facebookOnly ? (
        <Notice tone="warning" className="mb-5">
          {t('setPassword.facebookOnly')}
        </Notice>
      ) : null}
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
        />
        <ul className="space-y-1.5 text-[14px]">
          {rules.map((rule) => (
            <li
              key={rule.key}
              className={`flex items-center gap-2 ${rule.ok ? 'text-success' : 'text-neutral-700'}`}
            >
              <Icon
                name="check"
                size={16}
                strokeWidth={3}
                className={rule.ok ? '' : 'opacity-40'}
              />
              {rule.label}
            </li>
          ))}
          <li className="flex items-center gap-2 text-neutral-700">
            <Icon name="check" size={16} strokeWidth={3} className="opacity-40" />
            {t('setPassword.ruleNotPhone')}
          </li>
        </ul>
        {mutation.isError ? <ErrorBanner message={errorMessage(mutation.error, t)} /> : null}
        <Button type="submit" loading={mutation.isPending}>
          {t('setPassword.submit')}
        </Button>
      </form>
    </StepFrame>
  );
}
