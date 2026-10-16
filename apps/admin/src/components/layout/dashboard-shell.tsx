import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useMe, useSignOut } from '@/api/auth';
import { ApiClientError } from '@/api/client';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { AuthCard } from '@/components/auth-card';
import { Button } from '@/components/button';
import { BottomNav } from '@/components/layout/bottom-nav';
import { LifecycleBanner } from '@/components/layout/lifecycle-banner';
import { MobileHeader } from '@/components/layout/mobile-header';
import { visibleNavItems } from '@/components/layout/nav-items';
import { PoweredByMark } from '@/components/layout/powered-by-mark';
import { Sidebar } from '@/components/layout/sidebar';
import { Suspended } from '@/views/suspended';

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
  const items = visibleNavItems(me.data);

  // TEN-16: the shop name in the tab title. Falls back to the app name until /me resolves.
  useDocumentTitle(shopName ?? t('common.appName'));

  const handleSignOut = (): void => {
    signOut.mutate();
  };

  // LIF-11: a staff session on a locked/archived shop gets `tenant_offline` straight from /me
  // (DashboardGuard throws before the route handler ever runs) — there's no successful tenant to read a
  // state off, so the normal shell (which needs one for nav/shopName) can't render at all. This is the one
  // screen for that, instead of a blank page or scattered per-widget errors.
  if (me.isError && me.error instanceof ApiClientError && me.error.code === 'tenant_offline') {
    return (
      <AuthCard
        title={t('dashboard.unavailable.title')}
        subtitle={t('dashboard.unavailable.subtitle')}
      >
        <Button type="button" variant="outline" loading={signOut.isPending} onClick={handleSignOut}>
          {t('dashboard.logout')}
        </Button>
      </AuthCard>
    );
  }

  // LIF-24 (decided 2026-10-16): a suspended owner reaches /me successfully (DashboardGuard's own
  // suspendedOwner carve-out), but only for the narrow set of routes that help resolve the suspension —
  // never the full dashboard. Shown instead of the normal shell, not alongside it.
  if (me.data?.isOwner && me.data.tenant?.suspended) {
    return <Suspended onSignOut={handleSignOut} signOutPending={signOut.isPending} />;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar
        shopName={shopName}
        items={items}
        onSignOut={handleSignOut}
        signOutPending={signOut.isPending}
      />
      <MobileHeader shopName={shopName} />

      <main className="pb-20 sm:pb-10 sm:pl-64">
        <LifecycleBanner tenant={me.data?.tenant ?? null} />
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
      <BottomNav
        items={items}
        shopName={shopName}
        onSignOut={handleSignOut}
        signOutPending={signOut.isPending}
      />
    </div>
  );
}
