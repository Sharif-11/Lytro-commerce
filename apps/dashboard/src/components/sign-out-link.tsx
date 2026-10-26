import { useTranslation } from 'react-i18next';
import { useSignOut } from '@/api/me';

/**
 * Sign out under a page without a shell (TENANT-DASHBOARD-DESIGN §7.20, added 2026-10-26): with no shell there is
 * otherwise no way out of Renew or Unavailable.
 */
export function SignOutLink(): React.JSX.Element {
  const { t } = useTranslation('money');
  const signOut = useSignOut();
  return (
    <p className="text-center text-[14px]">
      <button
        type="button"
        disabled={signOut.isPending}
        onClick={() => {
          signOut.mutate();
        }}
        className="font-medium text-primary"
      >
        {t('signOut')}
      </button>
    </p>
  );
}
