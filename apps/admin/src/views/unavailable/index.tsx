import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { AuthCard } from '@/components/auth-card';

// The shared landing for next: 'renewal' | 'purchase' | 'unavailable' — plan subscription/renewal is Phase 2
// (docs/PHASE-1-PLAN.md), so these three states have no dedicated screens yet in Phase 1.
export function Unavailable(): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <AuthCard
      title={t('auth.unavailable.title')}
      subtitle={t('auth.unavailable.subtitle')}
      footer={
        <Link to="/sign-in" className="text-brand-700 hover:underline">
          {t('auth.unavailable.backToSignIn')}
        </Link>
      }
    >
      <div />
    </AuthCard>
  );
}
