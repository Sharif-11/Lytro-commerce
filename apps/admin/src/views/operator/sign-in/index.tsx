import { useTranslation } from 'react-i18next';

// Placeholder: proves the operator route tree resolves on its own host (docs/DEPLOYMENT.md §5, host.ts). The
// real sign-in → enroll → verify flow (ADM-01) is a later step.
export function OperatorSignIn(): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <main>
      <h1>{t('common.appName')} — Operator</h1>
      <p>Operator sign-in — the real screen lands later.</p>
    </main>
  );
}
