import type { ReactNode } from 'react';
import { Link, useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Permission, TenantState } from '@lytronix/validators';
import { useBalance } from '@/api/balance';
import { useInvoices } from '@/api/billing';
import { useIdentities } from '@/api/identities';
import { useMe, useSignOut } from '@/api/me';
import { useStaffList } from '@/api/staff';
import {
  formatDate,
  formatTakaExact,
  Icon,
  type IconName,
  LanguageToggle,
  Page,
  PageHeader,
  PoweredByLytro,
} from '@lytronix/ui';
import { appConfig } from '@/lib/app-config';
import { hasPermission } from '@/lib/permissions';
import type { MeResponse } from '@/types/me';

type SectionPath =
  | '/$shop/plan'
  | '/$shop/balance'
  | '/$shop/invoices'
  | '/$shop/settings'
  | '/$shop/team'
  | '/$shop/activity'
  | '/$shop/account';

/**
 * A grouped menu with one line of live context per row (DASHBOARD-SECTIONS-DESIGN §1): Billing, Shop, You.
 * Rows the signed-in staff member lacks the permission for are hidden, never disabled (STF-11). Container:
 * it reads the four summaries the context lines need, each only when the row is visible.
 */
export function More(): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const { shop } = useParams({ from: '/$shop/menu' });
  const me = useMe();
  const signOut = useSignOut();
  const data = me.data;
  const can = (permission: Permission): boolean => hasPermission(data, permission);
  const isOwner = data?.isOwner === true;

  const balance = useBalance({ enabled: can(Permission.BalanceRead) });
  const invoices = useInvoices({ enabled: can(Permission.PaymentsRead) });
  const staff = useStaffList({ enabled: can(Permission.StaffRead) });
  const identities = useIdentities({ enabled: isOwner });

  const planLine = planContext(data, t, i18n.language);
  const seatsLine = staff.data
    ? staff.data.seats.total === null
      ? t('more.seatsUnlimited', { used: staff.data.seats.used })
      : t('more.seats', { used: staff.data.seats.used, total: staff.data.seats.total })
    : null;
  const identityLine = identities.data
    ? identities.data.identities.map((identity) => t(`account.kind.${identity.kind}`)).join(', ')
    : null;

  return (
    <Page narrow>
      <PageHeader title={t('nav.more')} />

      <Group title={t('more.groups.billing')}>
        {can(Permission.PaymentsRead) ? (
          <Row shop={shop} to="/$shop/plan" icon="tag" title={t('more.plan')} sub={planLine} />
        ) : null}
        {can(Permission.BalanceRead) ? (
          <Row
            shop={shop}
            to="/$shop/balance"
            icon="wallet"
            title={t('nav.balance')}
            sub={balance.data ? formatTakaExact(balance.data.amount) : null}
          />
        ) : null}
        {can(Permission.PaymentsRead) ? (
          <Row
            shop={shop}
            to="/$shop/invoices"
            icon="orders"
            title={t('invoices.title')}
            sub={invoices.data ? t('more.invoiceCount', { count: invoices.data.length }) : null}
          />
        ) : null}
      </Group>

      <Group title={t('more.groups.shop')}>
        {can(Permission.SettingsManage) ? (
          <Row
            shop={shop}
            to="/$shop/settings"
            icon="settings"
            title={t('settings.title')}
            sub={t('more.settingsSub')}
          />
        ) : null}
        {can(Permission.StaffRead) ? (
          <Row shop={shop} to="/$shop/team" icon="users" title={t('team.title')} sub={seatsLine} />
        ) : null}
        {can(Permission.AuditRead) ? (
          <Row
            shop={shop}
            to="/$shop/activity"
            icon="orders"
            title={t('activity.title')}
            sub={t('more.activitySub')}
          />
        ) : null}
      </Group>

      <Group title={t('more.groups.you')}>
        {isOwner ? (
          <Row
            shop={shop}
            to="/$shop/account"
            icon="shield"
            title={t('account.title')}
            sub={identityLine}
          />
        ) : null}
        <div className="flex min-h-[58px] items-center gap-3 border-t border-line px-4 py-3 first:border-t-0">
          <RowIcon name="globe" />
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-bold text-ink">{t('common.language')}</p>
            <p className="text-[13px] text-neutral-700">
              {i18n.language === 'bn' ? t('more.languageBn') : t('more.languageEn')}
            </p>
          </div>
          <LanguageToggle />
        </div>
        <a
          href={appConfig.contactUrl()}
          className="flex min-h-[58px] items-center gap-3 border-t border-line px-4 py-3"
        >
          <RowIcon name="phone" />
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-bold text-ink">{t('more.support')}</p>
            <p className="text-[13px] text-neutral-700">{t('more.supportSub')}</p>
          </div>
          <span className="text-neutral-400">
            <Icon name="next" size={18} />
          </span>
        </a>
        <button
          type="button"
          disabled={signOut.isPending}
          onClick={() => {
            signOut.mutate();
          }}
          className="flex min-h-[58px] w-full items-center gap-3 border-t border-line px-4 py-3 text-left disabled:opacity-60"
        >
          <RowIcon name="logout" muted />
          <p className="text-[15px] font-bold text-ink">{t('common.signOut')}</p>
        </button>
      </Group>

      <p className="flex items-center justify-center gap-1 py-2 text-[12px] text-neutral-700">
        <PoweredByLytro /> · Lytronix
      </p>
    </Page>
  );
}

function planContext(
  data: MeResponse | undefined,
  t: (key: string, options?: Record<string, unknown>) => string,
  language: string,
): string | null {
  const tenant = data?.tenant;
  if (!tenant) return null;
  if (tenant.state === TenantState.Trial) return t('more.planTrial');
  if (tenant.state === TenantState.PayAsYouGo) return t('plan.state.pay_as_you_go');
  if (tenant.planName && tenant.periodEnd) {
    return t('more.planRenews', {
      plan: tenant.planName,
      date: formatDate(tenant.periodEnd, language),
    });
  }
  return tenant.planName ?? t('plan.noPlan');
}

function Group({ title, children }: { title: string; children: ReactNode }): React.JSX.Element {
  return (
    <section>
      <h2 className="mb-2 px-1 text-[14px] font-bold text-neutral-700">{title}</h2>
      <div className="overflow-hidden rounded-card border border-line bg-white shadow-card">
        {children}
      </div>
    </section>
  );
}

function RowIcon({ name, muted = false }: { name: IconName; muted?: boolean }): React.JSX.Element {
  return (
    <span
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] ${
        muted ? 'bg-neutral-100 text-neutral-700' : 'bg-brand-50 text-brand-700'
      }`}
    >
      <Icon name={name} size={20} />
    </span>
  );
}

function Row({
  shop,
  to,
  icon,
  title,
  sub,
}: {
  shop: string;
  to: SectionPath;
  icon: IconName;
  title: string;
  sub: string | null;
}): React.JSX.Element {
  return (
    <Link
      to={to}
      params={{ shop }}
      className="flex min-h-[58px] items-center gap-3 border-t border-line px-4 py-3 first:border-t-0 hover:bg-neutral-50"
    >
      <RowIcon name={icon} />
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-bold text-ink">{title}</p>
        {sub ? <p className="num truncate text-[13px] text-neutral-700">{sub}</p> : null}
      </div>
      <span className="text-neutral-400">
        <Icon name="next" size={18} />
      </span>
    </Link>
  );
}
