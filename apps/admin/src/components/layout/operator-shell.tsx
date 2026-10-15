import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { BrandMark } from '@/components/layout/brand-mark';
import { operatorNavItems } from '@/components/layout/operator-nav-items';
import { OperatorSidebar } from '@/components/layout/operator-sidebar';
import { PoweredByMark } from '@/components/layout/powered-by-mark';

interface OperatorShellProps {
  children: ReactNode;
  onSignOut: () => void;
  signOutPending: boolean;
}

/** The operator console's shell. On larger screens (sm and up) this matches the tenant dashboard's own
    DashboardShell layout exactly — a fixed dark OperatorSidebar plus a content area offset by `sm:pl-64` —
    so the two consoles share one visual language instead of looking like different products. Below sm there
    is no sidebar to show (same reasoning DashboardShell's Sidebar/BottomNav split uses), so this falls back
    to a slim branded header with the three destinations as a horizontal link row — the operator console has
    only three today (D2-9's scope), too few to justify a full BottomNav/AccountSheet clone. */
export function OperatorShell({
  children,
  onSignOut,
  signOutPending,
}: OperatorShellProps): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-slate-50">
      <OperatorSidebar onSignOut={onSignOut} signOutPending={signOutPending} />

      <header className="sticky top-0 z-20 border-b border-slate-100 bg-white sm:hidden">
        <div className="flex h-14 items-center justify-between px-4">
          <BrandMark compact />
          <button
            type="button"
            onClick={onSignOut}
            disabled={signOutPending}
            className="text-sm font-medium text-slate-500 disabled:opacity-60"
          >
            {t('dashboard.logout')}
          </button>
        </div>
        <nav className="flex gap-1 overflow-x-auto border-t border-slate-100 px-2 py-1.5">
          {operatorNavItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600"
              activeProps={{ className: 'bg-brand-50 text-brand-700' }}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {t(item.labelKey)}
            </Link>
          ))}
        </nav>
      </header>

      <main className="sm:pl-64">
        <div className="mx-auto w-full max-w-6xl px-5 py-6 sm:px-6 sm:py-8">
          {children}
          <div className="pt-6">
            <PoweredByMark />
          </div>
        </div>
      </main>
    </div>
  );
}
