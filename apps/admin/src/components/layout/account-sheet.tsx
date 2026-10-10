import { useTranslation } from 'react-i18next';
import { LanguageToggle } from '@/components/layout/language-toggle';
import { LogoutIcon } from '@/components/icons';

interface AccountSheetProps {
  open: boolean;
  onClose: () => void;
  shopName: string | null;
  onSignOut: () => void;
  signOutPending: boolean;
}

/**
 * Mobile-only bottom sheet (sm:hidden), triggered from BottomNav's account tab — the reference dashboard's
 * own mobile pattern for anything that doesn't fit the tab bar itself (there it holds overflow nav; Lytro's
 * four destinations all fit as direct tabs, so this sheet holds just the account actions: shop identity,
 * language, sign-out).
 */
export function AccountSheet({
  open,
  onClose,
  shopName,
  onSignOut,
  signOutPending,
}: AccountSheetProps): React.JSX.Element | null {
  const { t } = useTranslation();
  if (!open) {
    return null;
  }

  const initial = (shopName ?? t('common.appName')).trim().charAt(0).toUpperCase();

  return (
    <div className="fixed inset-0 z-30 sm:hidden">
      <button
        type="button"
        aria-label={t('common.close')}
        className="absolute inset-0 bg-slate-900/40"
        onClick={onClose}
      />
      <div className="absolute inset-x-0 bottom-0 rounded-t-3xl bg-white p-5 pb-8 shadow-2xl shadow-slate-900/20">
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-slate-200" />

        <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-100 text-base font-bold text-brand-700">
            {initial}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">
            {shopName ?? t('common.appName')}
          </span>
        </div>

        <div className="flex items-center justify-between py-4">
          <span className="text-sm font-medium text-slate-600">{t('common.language')}</span>
          <LanguageToggle />
        </div>

        <button
          type="button"
          onClick={onSignOut}
          disabled={signOutPending}
          className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-60"
        >
          <LogoutIcon className="h-4 w-4" />
          {t('dashboard.logout')}
        </button>
      </div>
    </div>
  );
}
