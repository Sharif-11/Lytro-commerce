import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation, useMatches, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Permission, TenantState } from '@lytronix/validators';
import { ApiClientError, errorMessage } from '@lytronix/api-client';
import { ErrorBanner } from '@lytronix/ui';
import { useHome } from '@/api/home';
import { useNoticeSummary } from '@/api/notices';
import { useMe, useSignOut } from '@/api/me';
import { OnboardingFrame } from '@/components/onboarding/frame';
import { Button } from '@/components/ui/button';
import { buttonClass } from '@/components/ui/classes';
import { Toast } from '@/components/ui/toast';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { useRefusedSaving } from '@/hooks/use-saving-paused';
import { useToast } from '@/hooks/use-toast';
import type { MeResponse, MeTenant } from '@/types/me';
import { AppBar } from './app-bar';
import { DeskHeader } from './desk-header';
import { allows, hasPlusActions, hubOf, SEARCH_NEEDS, sectionOf, type Viewer } from './hubs';
import { PlusMenu } from './plus-menu';
import { useBrandTheme } from './brand-theme';
import { Rail } from './rail';
import type { ScreenMeta } from './route-meta';
import { ShellContext, type ShellState } from './shell-context';
import { LegacyPage } from './shell-page';
import { SideColumn } from './side-column';
import { TabBar } from './tab-bar';
import { LeadTo } from './lead-to';
import { useShopManifest } from './use-shop-manifest';
import { Unavailable } from '@/views/unavailable';
import { ImportantPrompt, NoticeBands, UpdatePrompt } from '@/views/notices/notice-bands';

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
  // BRN-02: the shop's identity while it shows, on this shop's screens only.
  useBrandTheme(tenant?.slug === slug ? tenant.brand : null);

  if (me.isLoading) {
    return <p className="p-6 text-center text-[15px] text-neutral-700">{t('common.loading')}</p>;
  }

  // AUTH-22, LIF-11: staff on a locked, archived or suspended shop are refused by /me itself.
  if (me.isError && me.error instanceof ApiClientError && me.error.code === 'tenant_offline') {
    return (
      <OnboardingFrame title={t('shop.offline.title')} lead={t('shop.offline.lead')}>
        <Button
          tone="outline"
          wide
          busy={signOut.isPending}
          onClick={() => {
            signOut.mutate();
          }}
        >
          {t('common.signOut')}
        </Button>
      </OnboardingFrame>
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
      <OnboardingFrame title={t('shop.notFound.title')} lead={t('shop.notFound.lead')}>
        <Link to="/shops" className={buttonClass('outline', 'md', true)}>
          {t('shop.notFound.goToMyShop')}
        </Link>
      </OnboardingFrame>
    );
  }

  // LIF-24 (TENANT-DASHBOARD-DESIGN §7.20): a suspended shop's owner sees Unavailable, with no reason, and may still
  // open Balance to settle what is owed; nothing else.
  if (tenant.suspended) {
    return (
      <BareShell slug={slug} me={me.data} tenant={tenant}>
        {location.pathname.endsWith('/balance') ? children : <Unavailable />}
      </BareShell>
    );
  }

  // LIF-11/12: a locked or archived shop has one page, Renew, without the shell; any other path leads there. NTC-07
  // (Part 37's `p37-locked`): its owner still reads Lytro's notices, an archived shop's urgent ones only.
  if (tenant.state === TenantState.Locked || tenant.state === TenantState.Archived) {
    const onBoard = /\/notices(\/[^/]+)?\/?$/.test(location.pathname) && me.data.isOwner;
    if (!location.pathname.endsWith('/renew') && !onBoard) {
      return <LeadTo slug={slug} page="renew" />;
    }
    return (
      <BareShell slug={slug} me={me.data} tenant={tenant}>
        {children}
      </BareShell>
    );
  }

  return (
    <ShellFrame slug={slug} me={me.data} tenant={tenant}>
      {children}
    </ShellFrame>
  );
}

/**
 * The shop and the person for a page without the shell (Renew, Unavailable, a suspended owner's Balance): the same
 * context a shell page reads, and its toasts, with no bars around it.
 */
function BareShell({
  slug,
  me,
  tenant,
  children,
}: {
  slug: string;
  me: MeResponse;
  tenant: MeTenant;
  children: ReactNode;
}): React.JSX.Element {
  const toast = useToast();
  const refusedSaving = useRefusedSaving();
  const shell: ShellState = {
    slug,
    tenant,
    viewer: { isOwner: me.isOwner, permissions: me.permissions },
    personName: me.name,
    signIn: me.signIn,
    staffPhone: me.phone,
    emailBounced: me.emailBounced ?? false,
    // A page without the shell reads no notices, so only a refused save says changes can't be saved.
    savingPaused: refusedSaving,
    limitedMode: false,
    showsBanners: false,
    roles: me.roles,
    screen: undefined,
    counts: { stock: null, billing: null, orders: null, notices: null },
    showToast: toast.show,
    openPlus: () => undefined,
    recordTitle: null,
    setRecordTitle: () => undefined,
  };
  return (
    <ShellContext.Provider value={shell}>
      {children}
      <Toast message={toast.message} />
    </ShellContext.Provider>
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
  children: ReactNode;
}

/**
 * The shell (TENANT-DASHBOARD-DESIGN §4, the prototype's `.shell`): under 1024 px the app bar over the page and the
 * tab bar under it; from 1024 px the rail, the header and, from 1280 px, the side column. The page scrolls inside it.
 */
function ShellFrame({ slug, me, tenant, children }: ShellFrameProps): React.JSX.Element {
  const { t } = useTranslation('shell');
  const navigate = useNavigate();
  const matches = useMatches();
  const screen = [...matches].reverse().find((match) => match.staticData.screen)?.staticData.screen;
  const viewer: Viewer = { isOwner: me.isOwner, permissions: me.permissions };
  const home = useHome();
  // NTC-03, NTC-04, NTC-14: what every page shows of Lytro's notices, for whoever may read them.
  const notices = useNoticeSummary({ enabled: allows(viewer, [Permission.NoticesRead]) });
  // D9-14, DAT-38 (Slice 9.9): the server's word on saving and on limited mode comes with the summary, read every minute;
  // a save refused for it says so at once.
  const refusedSaving = useRefusedSaving();
  const toast = useToast();
  const [plusOpen, setPlusOpen] = useState(false);
  const [recordTitle, setRecordTitle] = useState<string | null>(null);
  useShopManifest(slug);

  // §9: a deep link to a section this person may not open lands on Home, with a word on why.
  const allowed = screen ? mayOpen(screen, viewer) : true;
  const showToast = toast.show;
  // PAYMENT-PAGE-DESIGN §8: back from the payment page. What it says proves nothing; the screens read the truth, and this only says thanks.
  useEffect(() => {
    const address = new URL(window.location.href);
    if (!address.searchParams.has('session_id')) return;
    if (address.searchParams.get('status') === 'verified') showToast(t('paidOnPage'));
    for (const name of ['session_id', 'status', 'tracking_id']) address.searchParams.delete(name);
    window.history.replaceState(window.history.state, '', address.toString());
  }, [showToast, t]);
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
    signIn: me.signIn,
    staffPhone: me.phone,
    emailBounced: me.emailBounced ?? false,
    savingPaused: refusedSaving || notices.data?.savingPaused === true,
    limitedMode: notices.data?.limitedMode === true,
    showsBanners: true,
    roles: me.roles,
    screen,
    counts: {
      stock,
      billing: home.data?.paymentNeedingYou ? 1 : null,
      orders: home.data?.orders?.toConfirm || null,
      notices: notices.data?.unread || null,
    },
    showToast,
    openPlus: () => {
      setPlusOpen(true);
    },
    recordTitle,
    setRecordTitle,
  };
  const canSearch = allows(viewer, SEARCH_NEEDS);
  const canAdd = hasPlusActions(viewer);

  return (
    <ShellContext.Provider value={shell}>
      <div className="flex h-dvh flex-col bg-page font-ui text-[14px] leading-[1.45] text-fg">
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <Rail />
          <SideColumn />
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <AppBar canSearch={canSearch} canAdd={canAdd} />
            <DeskHeader canSearch={canSearch} canAdd={canAdd} />
            <NoticeBands summary={notices.data} />
            <main className="min-h-0 flex-1 overflow-auto [-webkit-overflow-scrolling:touch]">
              {screen?.legacy ? <LegacyPage>{children}</LegacyPage> : allowed ? children : null}
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
        {notices.data && notices.data.prompts.length > 0 ? (
          <ImportantPrompt prompts={notices.data.prompts} />
        ) : null}
        <UpdatePrompt />
        <Toast message={toast.message} />
      </div>
    </ShellContext.Provider>
  );
}
