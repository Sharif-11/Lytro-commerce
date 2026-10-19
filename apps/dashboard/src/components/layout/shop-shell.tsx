import type { ReactNode } from 'react';
import { Link, useLocation } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { TenantState } from '@lytronix/validators';
import { useMe, useSignOut } from '@/api/me';
import { ApiClientError, errorMessage } from '@lytronix/api-client';
import { Button, ErrorBanner } from '@lytronix/ui';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { StepFrame } from '@/components/ui/step-frame';
import { BottomNav } from './bottom-nav';
import { LifecycleBanner } from './lifecycle-banner';
import { ShopHeader } from './shop-header';
import { Sidebar } from './sidebar';

interface ShopShellProps {
  slug: string;
  children: ReactNode;
}

/**
 * The container for every screen under /<slug> (ENGINEERING-STANDARDS §2a): the one place in this subtree
 * that reads /me. It checks the path's slug against the person's shop (TEN-31: a stranger's slug and an
 * unknown one get the same not-found), renders the lifecycle exits (locked, archived, suspended, LIF-11,
 * LIF-24) and otherwise the shell around the page.
 */
export function ShopShell({ slug, children }: ShopShellProps): React.JSX.Element {
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

  if (me.isError) {
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

  // LIF-11/12: a locked or archived shop shows only the way back; the plan screen is that way back, so it
  // is the one route that still renders.
  const onPlans = location.pathname.endsWith('/plan');
  const lockedOut =
    (tenant.state === TenantState.Locked || tenant.state === TenantState.Archived) && !onPlans;

  return (
    <div className="min-h-screen bg-neutral-50">
      <Sidebar slug={slug} shopName={tenant.shopName} />
      <div className="lg:pl-64">
        <ShopHeader slug={slug} shopName={tenant.shopName} />
        <LifecycleBanner slug={slug} tenant={tenant} />
        <main className="pb-24 lg:pb-10">{lockedOut ? <LockedOut slug={slug} /> : children}</main>
      </div>
      <BottomNav slug={slug} />
    </div>
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
