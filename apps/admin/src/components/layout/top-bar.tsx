import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { BrandMark } from '@/components/layout/brand-mark';
import { LanguageToggle } from '@/components/layout/language-toggle';
import { navItems } from '@/components/layout/nav-items';

interface TopBarProps {
  shopName: string | null;
  onSignOut: () => void;
  signOutPending: boolean;
}

/** Desktop/tablet nav (sm and up) — presentational only, reads navItems rather than hardcoding its own set.
    See BottomNav for the same data rendered as a mobile tab bar instead; the two stay separate components on
    purpose (ENGINEERING-STANDARDS.md §2a/§4). */
export function TopBar({ shopName, onSignOut, signOutPending }: TopBarProps): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <header className="hidden border-b border-slate-100 bg-white sm:block">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-6 px-6 py-3">
        <div className="flex items-center gap-6">
          <BrandMark compact />
          {shopName ? <span className="text-sm font-medium text-slate-500">{shopName}</span> : null}
        </div>
        <nav className="flex items-center gap-1">
          {navItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              activeOptions={{ exact: item.to === '/dashboard' }}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              activeProps={{ className: 'text-brand-700 bg-brand-50' }}
            >
              <item.icon className="h-4 w-4" />
              {t(item.labelKey)}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <LanguageToggle />
          <button
            type="button"
            onClick={onSignOut}
            disabled={signOutPending}
            className="text-sm font-medium text-slate-500 hover:text-slate-700 disabled:opacity-60"
          >
            {t('dashboard.logout')}
          </button>
        </div>
      </div>
    </header>
  );
}
