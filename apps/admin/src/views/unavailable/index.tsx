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
      <div className="flex justify-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-accent-300/20 text-accent-500">
          <svg
            className="h-8 w-8"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <circle cx="12" cy="12" r="9" />
            <path strokeLinecap="round" d="M12 8v5M12 16h.01" />
          </svg>
        </span>
      </div>
    </AuthCard>
  );
}
