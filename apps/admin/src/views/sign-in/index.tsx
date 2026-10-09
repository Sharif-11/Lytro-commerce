import { useTranslation } from 'react-i18next';

// Placeholder: proves the shell (router, i18n, API client) end to end. The real sign-up/sign-in flow
// (AUTH-01, AUTH-05, AUTH-12) is slice 9's next step, not this one.
export function SignIn(): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <main>
      <h1>{t('common.appName')}</h1>
      <p>Tenant sign-in — the real screen lands next.</p>
    </main>
  );
}
