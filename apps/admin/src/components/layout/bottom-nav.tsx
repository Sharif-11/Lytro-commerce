import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { AccountSheet } from '@/components/layout/account-sheet';
import type { NavItem } from '@/components/layout/nav-items';
import { AccountIcon } from '@/components/icons';

interface BottomNavProps {
  shopName: string | null;
  items: NavItem[];
  onSignOut: () => void;
  signOutPending: boolean;
}

/** Mobile tab bar — every real destination as a direct tab (Lytro has only four, all fit; the reference
    dashboard's own bar only overflows into a sheet past its own, much larger item count), plus one more
    tab for account actions, which open a bottom sheet rather than navigating — mirroring the reference
    dashboard's own mobile pattern for anything that isn't page navigation. Fixed to the viewport bottom;
    DashboardShell reserves matching bottom padding on the content area. Active state is a soft pill behind
    just the icon, not the whole tab. */
export function BottomNav({
  shopName,
  items,
  onSignOut,
  signOutPending,
}: BottomNavProps): React.JSX.Element {
  const { t } = useTranslation();
  const [accountOpen, setAccountOpen] = useState(false);

  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-20 flex h-16 border-t border-slate-100 bg-white sm:hidden">
        {items.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            activeOptions={{ exact: item.to === '/dashboard' }}
            className="flex flex-1 flex-col items-center justify-center gap-1"
          >
            {({ isActive }) => (
              <>
                <span
                  className={`flex h-8 w-10 items-center justify-center rounded-full ${isActive ? 'bg-brand-50' : ''}`}
                >
                  <item.icon
                    className={`h-5 w-5 ${isActive ? 'text-brand-700' : 'text-slate-400'}`}
                  />
                </span>
                <span
                  className={`text-[11px] font-medium ${isActive ? 'text-brand-700' : 'text-slate-400'}`}
                >
                  {t(item.labelKey)}
                </span>
              </>
            )}
          </Link>
        ))}

        <button
          type="button"
          onClick={() => {
            setAccountOpen(true);
          }}
          className="flex flex-1 flex-col items-center justify-center gap-1"
        >
          <span className="flex h-8 w-10 items-center justify-center rounded-full">
            <AccountIcon className="h-5 w-5 text-slate-400" />
          </span>
          <span className="text-[11px] font-medium text-slate-400">{t('nav.account')}</span>
        </button>
      </nav>

      <AccountSheet
        open={accountOpen}
        onClose={() => {
          setAccountOpen(false);
        }}
        shopName={shopName}
        onSignOut={onSignOut}
        signOutPending={signOutPending}
      />
    </>
  );
}
