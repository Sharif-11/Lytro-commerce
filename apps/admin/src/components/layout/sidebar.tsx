import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { BrandMark } from '@/components/layout/brand-mark';
import { LanguageToggle } from '@/components/layout/language-toggle';
import type { NavItem } from '@/components/layout/nav-items';
import { LogoutIcon } from '@/components/icons';

interface SidebarProps {
  shopName: string | null;
  items: NavItem[];
  onSignOut: () => void;
  signOutPending: boolean;
}

/**
 * Desktop/tablet nav (sm and up) — a fixed left sidebar on the reference dashboard's own dark surface
 * (--color-sidebar/-alt/-line), not a light panel: following its UI/UX for both breakpoints now extends to
 * the sidebar's actual look, not just its layout. Nav list, with account/language/sign-out grouped at the
 * bottom. See BottomNav for the mobile equivalent; the two stay separate components on purpose
 * (ENGINEERING-STANDARDS.md §2a/§4), since their layouts differ too much to share.
 */
export function Sidebar({
  shopName,
  items,
  onSignOut,
  signOutPending,
}: SidebarProps): React.JSX.Element {
  const { t } = useTranslation();
  const initial = (shopName ?? t('common.appName')).trim().charAt(0).toUpperCase();

  return (
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col bg-sidebar sm:flex">
      <div className="flex h-16 shrink-0 items-center border-b border-sidebar-line px-5">
        <BrandMark compact inverted />
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {items.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            activeOptions={{ exact: item.to === '/dashboard' }}
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-white/70 transition hover:bg-sidebar-alt hover:text-white"
            activeProps={{
              className: 'bg-brand-600 text-white shadow-sm shadow-brand-900/40 hover:bg-brand-600',
            }}
          >
            <item.icon className="h-4.5 w-4.5 shrink-0" />
            {t(item.labelKey)}
          </Link>
        ))}
      </nav>

      <div className="shrink-0 space-y-3 border-t border-sidebar-line p-4">
        <LanguageToggle inverted />
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">
            {initial}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-white/80">
            {shopName ?? t('common.appName')}
          </span>
          <button
            type="button"
            onClick={onSignOut}
            disabled={signOutPending}
            aria-label={t('dashboard.logout')}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/50 transition hover:bg-sidebar-alt hover:text-white disabled:opacity-60"
          >
            <LogoutIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
