import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation, useMatches, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Permission, TenantState } from '@lytronix/validators';
import { ApiClientError, errorMessage } from '@lytronix/api-client';
import { Button, ErrorBanner } from '@lytronix/ui';
import { useHome } from '@/api/home';
import { useMe, useSignOut } from '@/api/me';
import { StepFrame } from '@/components/ui/step-frame';
import { Toast } from '@/components/ui/toast';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { useToast } from '@/hooks/use-toast';
import type { MeResponse, MeTenant } from '@/types/me';
import { AppBar } from './app-bar';
import { DeskHeader } from './desk-header';
import { allows, hasPlusActions, hubOf, sectionOf, type Viewer } from './hubs';
import { PlusMenu } from './plus-menu';
import { Rail } from './rail';
import type { ScreenMeta } from './route-meta';
import { ShellContext, type ShellState } from './shell-context';
import { LegacyPage } from './shell-page';
import { SideColumn } from './side-column';
import { TabBar } from './tab-bar';
import { useShopManifest } from './use-shop-manifest';

interface AppShellProps {
  slug: string;
  children: ReactNode;
}

/**
 * The container for every screen under /<slug> (ENGINEERING-STANDARDS §2a), and the one place in this subtree that
 * reads /me. It checks the path's slug against the person's shop (TEN-31: a stranger's slug and an unknown one get
 * the same not-found), renders the lifecycle exits (staff of an offline shop, a suspended owner, LIF-11, LIF-24) and
 * otherwise the shell around the page (TENANT-DASHBOARD-DESIGN §4).
 */
export function AppShell({ slug, children }: AppShellProps): React.JSX.Element {
  const { t } = useTranslation();
  const location = useLocation();
  const me = useMe();
  const signOut = useSignOut();
  const tenant = me.data?.tenant ?? null;

  useDocumentTitle(tenant ? `${tenant.shopName} · Lytro` : null);

  if (me.isLoading) {
    return <p className="p-6 text-center text-[15px] text-neutral-700">{t('common.loading')}</p>;
  }

  // AUTH-22, LIF-11: staff on a locked, archived or suspended shop are refused by /me itself.
  if (me.isError && me.error instanceof ApiClientError && me.error.code === 'tenant_offline') {
    return (
      <StepFrame title={t('shop.offline.title')} lead={t('shop.offline.lead')}>
        <Button
          type="button"
          tone="outline"
          loading={signOut.isPending}
          onClick={() => {
            signOut.mutate();
          }}
        >
          {t('common.signOut')}
        </Button>
      </StepFrame>
    );
  }

  if (me.isError || !me.data) {
    return (
      <div className="p-6">
        <ErrorBanner message={errorMessage(me.error, t)} />
      </div>
    );
  }

  if (!tenant || tenant.slug !== slug) {
    return (
      <StepFrame title={t('shop.notFound.title')} lead={t('shop.notFound.lead')}>
        <Link to="/shops" className="block">
          <Button type="button" tone="outline">
            {t('shop.notFound.goToMyShop')}
          </Button>
        </Link>
      </StepFrame>
    );
  }

  // LIF-24: a suspended owner sees one screen with the support button and no reason.
  if (tenant.suspended) {
    return (
      <StepFrame title={t('shop.suspended.title')} lead={t('shop.suspended.lead')}>
        <div className="space-y-3">
          <Link to="/$shop/balance" params={{ shop: slug }} className="block">
            <Button type="button" tone="outline">
              {t('shop.suspended.balance')}
            </Button>
          </Link>
          <Button
            type="button"
            tone="ghost"
            loading={signOut.isPending}
            onClick={() => {
              signOut.mutate();
            }}
          >
            {t('common.signOut')}
          </Button>
        </div>
      </StepFrame>
    );
  }

  // LIF-11/12: a locked or archived shop shows only the way back; the plan screen is that way back, so it is the
  // one route that still renders. Slice 11.5 turns this into the Renew page (TENANT-DASHBOARD-DESIGN §7.20).
  const lockedOut =
    (tenant.state === TenantState.Locked || tenant.state === TenantState.Archived) &&
    !location.pathname.endsWith('/plan');

  return (
    <ShellFrame slug={slug} me={me.data} tenant={tenant} lockedOut={lockedOut}>
      {children}
    </ShellFrame>
  );
}

/** Whether this person may open the screen: its section's rule, its hub's for a hub without sections, its own. */
function mayOpen(screen: ScreenMeta, viewer: Viewer): boolean {
  if (screen.needs && !allows(viewer, screen.needs)) return false;
  if (screen.section) return allows(viewer, sectionOf(screen.section).anyOf);
  const hub = hubOf(screen.hub);
  return hub.sections.length > 0 || allows(viewer, hub.anyOf);
}

interface ShellFrameProps {
  slug: string;
  me: MeResponse;
  tenant: MeTenant;
  lockedOut: boolean;
  children: ReactNode;
}

/**
 * The shell (TENANT-DASHBOARD-DESIGN §4, the prototype's `.shell`): under 1024 px the app bar over the page and the
 * tab bar under it; from 1024 px the rail, the header and, from 1280 px, the side column. The page scrolls inside it.
 */
function ShellFrame({ slug, me, tenant, lockedOut, children }: ShellFrameProps): React.JSX.Element {
  const { t } = useTranslation('shell');
  const navigate = useNavigate();
  const matches = useMatches();
  const screen = [...matches].reverse().find((match) => match.staticData.screen)?.staticData.screen;
  const viewer: Viewer = { isOwner: me.isOwner, permissions: me.permissions };
  const home = useHome({ enabled: !lockedOut });
  const toast = useToast();
  const [plusOpen, setPlusOpen] = useState(false);
  useShopManifest(slug);

  // §9: a deep link to a section this person may not open lands on Home, with a word on why.
  const allowed = screen ? mayOpen(screen, viewer) : true;
  const showToast = toast.show;
  useEffect(() => {
    if (allowed) return;
    showToast(t('noAccess'));
    void navigate({ to: '/$shop', params: { shop: slug }, replace: true });
  }, [allowed, navigate, showToast, slug, t]);

  const stock = home.data?.stock ? home.data.stock.low + home.data.stock.out : null;
  const shell: ShellState = {
    slug,
    tenant,
    viewer,
    personName: me.name,
    screen,
    counts: { stock },
    showToast,
    openPlus: () => {
      setPlusOpen(true);
    },
  };
  const canSearch = allows(viewer, [Permission.ProductsRead]);
  const canAdd = !lockedOut && hasPlusActions(viewer);

  return (
    <ShellContext.Provider value={shell}>
      <div className="flex h-dvh flex-col bg-neutral-50 font-sans text-[14px] leading-[1.45] text-fg">
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <Rail />
          <SideColumn />
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <AppBar canSearch={canSearch} canAdd={canAdd} />
            <DeskHeader canSearch={canSearch} canAdd={canAdd} />
            <main className="min-h-0 flex-1 overflow-auto [-webkit-overflow-scrolling:touch]">
              {lockedOut ? (
                <LockedOut slug={slug} />
              ) : screen?.legacy ? (
                <LegacyPage>{children}</LegacyPage>
              ) : allowed ? (
                children
              ) : null}
            </main>
            <TabBar />
          </div>
        </div>
        <PlusMenu
          open={plusOpen}
          onClose={() => {
            setPlusOpen(false);
          }}
        />
        <Toast message={toast.message} />
      </div>
    </ShellContext.Provider>
  );
}

/** LIF-11/12: a locked or archived shop shows only the way back, never the working dashboard. */
function LockedOut({ slug }: { slug: string }): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="mx-auto max-w-[520px] px-4 py-10 text-center sm:px-6">
      <h1 className="heading text-[22px] text-ink">{t('shop.lockedOut.title')}</h1>
      <p className="mt-2 text-[15px] text-neutral-700">{t('shop.lockedOut.lead')}</p>
      <Link to="/$shop/plan" params={{ shop: slug }} className="mt-6 block">
        <Button type="button">{t('shop.lockedOut.renew')}</Button>
      </Link>
    </div>
  );
}
