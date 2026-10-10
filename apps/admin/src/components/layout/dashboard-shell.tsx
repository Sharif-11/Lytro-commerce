import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useMe, useSignOut } from '@/api/auth';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { BottomNav } from '@/components/layout/bottom-nav';
import { MobileHeader } from '@/components/layout/mobile-header';
import { PoweredByMark } from '@/components/layout/powered-by-mark';
import { Sidebar } from '@/components/layout/sidebar';

interface DashboardShellProps {
  children: ReactNode;
}

/**
 * The container for every real dashboard screen (ENGINEERING-STANDARDS.md §2a): the only place in this
 * subtree that fetches data or runs a side effect. Everything it renders — Sidebar, MobileHeader, BottomNav,
 * PoweredByMark — is a presentational component that just takes props.
 */
export function DashboardShell({ children }: DashboardShellProps): React.JSX.Element {
  const { t } = useTranslation();
  const me = useMe();
  const signOut = useSignOut();
  const shopName = me.data?.tenant?.shopName ?? null;

  // TEN-16: the shop name in the tab title. Falls back to the app name until /me resolves.
  useDocumentTitle(shopName ?? t('common.appName'));

  const handleSignOut = (): void => {
    signOut.mutate();
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar shopName={shopName} onSignOut={handleSignOut} signOutPending={signOut.isPending} />
      <MobileHeader shopName={shopName} />

      <main className="pb-20 sm:pb-10 sm:pl-64">
        {children}
        {/* Desktop: an ordinary footer line, in the page's normal flow. */}
        <div className="hidden py-6 sm:block">
          <PoweredByMark />
        </div>
      </main>

      {/* Mobile: sits directly above the fixed BottomNav rather than competing with it for the bottom edge
          — TEN-18's mark is still always on screen, just not inside the tab bar itself. */}
      <div className="fixed inset-x-0 bottom-16 z-20 border-t border-slate-100 bg-white py-1.5 sm:hidden">
        <PoweredByMark />
      </div>
      <BottomNav shopName={shopName} onSignOut={handleSignOut} signOutPending={signOut.isPending} />
    </div>
  );
}
