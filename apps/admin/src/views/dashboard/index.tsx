import { useTranslation } from 'react-i18next';
import { AuthCard } from '@/components/auth-card';

// Proves this auth slice's routing end to end. The real dashboard shell (branding from /me, nav, language
// toggle) is the next slice, not this one.
export function DashboardPlaceholder(): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <AuthCard
      title={t('dashboard.placeholder.title')}
      subtitle={t('dashboard.placeholder.subtitle')}
    >
      <div />
    </AuthCard>
  );
}
