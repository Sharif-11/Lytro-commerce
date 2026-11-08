import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Permission } from '@lytronix/validators';
import { useTaxClasses } from '@/api/tax-classes';
import type { IconName } from '@/components/icon';
import { Card } from '@/components/ui/card';
import { RowList } from '@/components/ui/list-row';
import { allows } from '@/shell/hubs';
import { useShell } from '@/shell/shell-context';
import { ShellPage } from '@/shell/shell-page';
import { menuRowClass, MenuRowInner } from '@/views/menu/menu-parts';

type SettingsPath =
  | '/$shop/settings/shop'
  | '/$shop/delivery'
  | '/$shop/settings/couriers'
  | '/$shop/settings/payment-methods'
  | '/$shop/settings/listener'
  | '/$shop/settings/sms'
  | '/$shop/settings/notifications'
  | '/$shop/settings/fraud-checks'
  | '/$shop/settings/brand'
  | '/$shop/settings/storefront'
  | '/$shop/settings/tax'
  | '/$shop/settings/api-keys'
  | '/$shop/settings/meta'
  | '/$shop/settings/export';

// What each row is (its title the page's own, from the shell), where it goes, and who sees it (STF-11: hidden, never disabled; LIF-16: the export is the owner's).
const ROWS: readonly {
  icon: IconName;
  title: string;
  sub: string;
  to: SettingsPath;
  anyOf: readonly Permission[] | 'owner';
}[] = [
  {
    icon: 'shop',
    title: 'sShop',
    sub: 'sShopD',
    to: '/$shop/settings/shop',
    anyOf: [Permission.SettingsManage],
  },
  {
    icon: 'truck',
    title: 'secDelivery',
    sub: 'sDeliveryD',
    to: '/$shop/delivery',
    anyOf: [Permission.SettingsManage],
  },
  // Phase 6 (Part 36's `c36-settings`): the shop's couriers, for whoever may connect them or book with them.
  {
    icon: 'box',
    title: 'sCourier',
    sub: 'sCourierD',
    to: '/$shop/settings/couriers',
    anyOf: [Permission.CouriersManage, Permission.OrdersManage],
  },
  {
    icon: 'banknote',
    title: 'sMethods',
    sub: 'pmRowD',
    to: '/$shop/settings/payment-methods',
    anyOf: [Permission.WalletsRead],
  },
  {
    icon: 'image',
    title: 'sBrand',
    sub: 'sBrandD',
    to: '/$shop/settings/brand',
    anyOf: [Permission.SettingsManage],
  },
  {
    icon: 'smartphone',
    title: 'sListener',
    sub: 'sListenerD',
    to: '/$shop/settings/listener',
    anyOf: [Permission.ListenerRead],
  },
  // Phase 7 (Part 37's `p37-settings`): SMS, each person's own notifications, and the fake order check's rule.
  {
    icon: 'sms',
    title: 'sSms',
    sub: 'p37sSmsD',
    to: '/$shop/settings/sms',
    anyOf: [Permission.SmsRead],
  },
  {
    icon: 'bell',
    title: 'sNotif',
    sub: 'p37sNotifD',
    to: '/$shop/settings/notifications',
    anyOf: [],
  },
  {
    icon: 'shield',
    title: 'sFraud',
    sub: 'p37sFraudD',
    to: '/$shop/settings/fraud-checks',
    anyOf: [Permission.FraudRead],
  },
  {
    icon: 'globe',
    title: 'sStore',
    sub: 'sStoreD',
    to: '/$shop/settings/storefront',
    anyOf: [Permission.SettingsManage],
  },
  {
    icon: 'percent',
    title: 'sTax',
    sub: 'sTaxNone',
    to: '/$shop/settings/tax',
    anyOf: [Permission.SettingsManage],
  },
  {
    icon: 'key',
    title: 'sApi',
    sub: 'sApiD',
    to: '/$shop/settings/api-keys',
    anyOf: [Permission.KeysManage],
  },
  {
    icon: 'trend',
    title: 'sAds',
    sub: 'sAdsD',
    to: '/$shop/settings/meta',
    anyOf: [Permission.SettingsManage],
  },
  {
    icon: 'download',
    title: 'sExport',
    sub: 'sExportD',
    to: '/$shop/settings/export',
    anyOf: 'owner',
  },
];

/**
 * Settings (TENANT-DASHBOARD-DESIGN §7.16, the prototype's `settings`): the shop's own settings as rows into their
 * pages, each as its permission allows. Since Phase 7 (Part 37) nothing is left "coming later".
 */
export function SettingsView(): React.JSX.Element {
  const { t } = useTranslation('menu');
  const { t: shell } = useTranslation('shell');
  const { slug, viewer } = useShell();
  const rows = ROWS.filter((row) =>
    row.anyOf === 'owner' ? viewer.isOwner : allows(viewer, row.anyOf),
  );
  const taxes = useTaxClasses({ enabled: allows(viewer, [Permission.SettingsManage]) });
  const classes = taxes.data?.classes ?? [];
  const fallback = classes.find((each) => each.id === taxes.data?.defaultId);
  const taxSub =
    classes.length === 0
      ? t('sTaxNone')
      : fallback
        ? t('sTaxDefault', { name: fallback.name, count: classes.length })
        : t('sTaxCount', { count: classes.length });
  return (
    <ShellPage>
      {rows.length > 0 ? (
        <Card flush>
          <RowList>
            {rows.map((row) => (
              <Link key={row.to} to={row.to} params={{ shop: slug }} className={menuRowClass}>
                <MenuRowInner
                  icon={row.icon}
                  title={shell(row.title)}
                  sub={row.title === 'sTax' ? taxSub : t(row.sub)}
                />
              </Link>
            ))}
          </RowList>
        </Card>
      ) : null}
    </ShellPage>
  );
}
