import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { BrandMark } from '@/components/layout/brand-mark';
import { LanguageToggle } from '@/components/layout/language-toggle';
import { operatorNavItems } from '@/components/layout/operator-nav-items';
import { LogoutIcon } from '@/components/icons';

interface OperatorSidebarProps {
  onSignOut: () => void;
  signOutPending: boolean;
}

/** The operator console's desktop sidebar (sm and up) — deliberately the same look as the tenant dashboard's
    own Sidebar (same dark bg-sidebar surface, same structure: brand mark, nav list, language/sign-out footer)
    so the two consoles read as one product family rather than two different admin tools. Kept as its own
    component rather than a shared one (ENGINEERING-STANDARDS.md §2a) since its items/labels are
    operator-specific and there's no shop identity row to show here. */
export function OperatorSidebar({
  onSignOut,
  signOutPending,
}: OperatorSidebarProps): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col bg-sidebar sm:flex">
      <div className="flex h-16 shrink-0 items-center border-b border-sidebar-line px-5">
        <BrandMark compact inverted />
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {operatorNavItems.map((item) => (
          <Link
            key={item.to}
            to={item.to}
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
            O
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-white/80">
            {t('operator.sidebar.label')}
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
