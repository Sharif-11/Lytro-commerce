import { Link, useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Permission } from '@lytronix/validators';
import { useMe, useSignOut } from '@/api/me';
import { PoweredByLytro } from '@/components/brand/wordmark';
import { Button } from '@/components/ui/button';
import { Icon, type IconName } from '@/components/ui/icon';
import { LanguageToggle } from '@/components/ui/language-toggle';
import { appConfig } from '@/lib/app-config';
import { hasPermission } from '@/lib/permissions';

type Target =
  | '/$shop/plans'
  | '/$shop/invoices'
  | '/$shop/staff'
  | '/$shop/roles'
  | '/$shop/activity'
  | '/$shop/settings'
  | '/$shop/account';

interface MoreLink {
  to: Target;
  labelKey: string;
  icon: IconName;
  permission?: Permission;
  ownerOnly?: boolean;
}

/** The More sheet's destinations, each gated by the permission its screen needs (D32). Nothing here offers
    "create another shop" (TEN-15). */
const links: MoreLink[] = [
  { to: '/$shop/plans', labelKey: 'more.plans', icon: 'tag', permission: Permission.PaymentsRead },
  {
    to: '/$shop/invoices',
    labelKey: 'invoices.title',
    icon: 'calendar',
    permission: Permission.PaymentsRead,
  },
  { to: '/$shop/staff', labelKey: 'staff.title', icon: 'users', permission: Permission.StaffRead },
  { to: '/$shop/roles', labelKey: 'roles.title', icon: 'shield', permission: Permission.StaffRead },
  {
    to: '/$shop/activity',
    labelKey: 'activity.title',
    icon: 'orders',
    permission: Permission.AuditRead,
  },
  {
    to: '/$shop/settings',
    labelKey: 'settings.title',
    icon: 'settings',
    permission: Permission.SettingsManage,
  },
  { to: '/$shop/account', labelKey: 'account.title', icon: 'lock', ownerOnly: true },
];

export function More(): React.JSX.Element {
  const { t } = useTranslation();
  const { shop } = useParams({ from: '/$shop/more' });
  const me = useMe();
  const signOut = useSignOut();
  const tenant = me.data?.tenant ?? null;
  const visible = links.filter((link) => {
    if (link.ownerOnly) return me.data?.isOwner === true;
    return link.permission ? hasPermission(me.data, link.permission) : true;
  });

  return (
    <div className="mx-auto w-full max-w-[640px] px-4 py-5 sm:px-6 sm:py-6">
      <h1 className="heading text-[22px] text-ink">{t('nav.more')}</h1>
      {tenant ? (
        <dl className="num mt-4 rounded-card border border-line bg-white p-4 text-[14px] shadow-card">
          <div className="flex justify-between gap-3">
            <dt className="text-neutral-700">{t('more.plan')}</dt>
            <dd className="font-semibold text-ink">
              {tenant.planName ?? t(`plans.state.${tenant.state}`)}
            </dd>
          </div>
          <div className="mt-2 flex justify-between gap-3">
            <dt className="text-neutral-700">{t('more.shopAddress')}</dt>
            <dd className="font-semibold break-all text-ink">{appConfig.shopHost(tenant.slug)}</dd>
          </div>
        </dl>
      ) : null}
      <ul className="mt-4 divide-y divide-line rounded-card border border-line bg-white shadow-card">
        {visible.map((link) => (
          <li key={link.to}>
            <Link
              to={link.to}
              params={{ shop }}
              className="flex min-h-12 items-center gap-3 px-4 text-[15px] font-semibold text-ink"
            >
              <Icon name={link.icon} size={20} className="text-brand-700" />
              {t(link.labelKey)}
              <Icon name="arrow" size={18} className="ml-auto text-neutral-500" />
            </Link>
          </li>
        ))}
        <li>
          <a
            href={appConfig.contactUrl()}
            className="flex min-h-12 items-center gap-3 px-4 text-[15px] font-semibold text-ink"
          >
            <Icon name="phone" size={20} className="text-brand-700" />
            {t('more.support')}
            <Icon name="arrow" size={18} className="ml-auto text-neutral-500" />
          </a>
        </li>
        <li className="flex min-h-12 items-center gap-3 px-4 text-[15px] font-semibold text-ink">
          <Icon name="globe" size={20} className="text-brand-700" />
          {t('common.language')}
          <span className="ml-auto">
            <LanguageToggle />
          </span>
        </li>
      </ul>
      <div className="mt-4">
        <Button
          type="button"
          tone="outline"
          loading={signOut.isPending}
          onClick={() => {
            signOut.mutate();
          }}
        >
          <Icon name="logout" size={18} />
          {t('common.signOut')}
        </Button>
      </div>
      <p className="mt-6 text-center">
        <PoweredByLytro />
      </p>
    </div>
  );
}
