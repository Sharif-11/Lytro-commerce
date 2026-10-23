import { useTranslation } from 'react-i18next';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@lytronix/validators';
import { Icon } from '@/components/icon';
import type { PasswordRuleCheck } from '@/lib/password-rules';

/** The prototype's `.rules`: the three rules under the password field, each turning green as it is met. */
export function PasswordRules({ check }: { check: PasswordRuleCheck }): React.JSX.Element {
  const { t } = useTranslation('onboarding');
  const rules: [keyof PasswordRuleCheck, string][] = [
    ['length', t('r1', { min: PASSWORD_MIN_LENGTH, max: PASSWORD_MAX_LENGTH })],
    ['digit', t('r2')],
    ['notPhone', t('r3')],
  ];
  return (
    <ul className="flex flex-col gap-1 text-[14px]">
      {rules.map(([key, label]) => (
        <li
          key={key}
          className={[
            'flex items-center gap-2',
            check[key] ? 'text-success' : 'text-fg-muted',
          ].join(' ')}
        >
          <Icon name="check" size={16} />
          {label}
        </li>
      ))}
    </ul>
  );
}
