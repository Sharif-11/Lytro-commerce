import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Permission } from '@lytronix/validators';
import type { IconName } from '@/components/icon';
import { Card } from '@/components/ui/card';
import { RowList } from '@/components/ui/list-row';
import { Eyebrow, PhasePill } from '@/components/ui/page';
import { allows } from '@/shell/hubs';
import { useShell } from '@/shell/shell-context';
import { ShellPage } from '@/shell/shell-page';
import { menuRowClass, MenuRowInner } from '@/views/menu/menu-parts';

type SettingsPath =
  | '/$shop/settings/shop'
  | '/$shop/delivery'
  | '/$shop/settings/brand'
  | '/$shop/settings/storefront'
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
  {
    icon: 'image',
    title: 'sBrand',
    sub: 'sBrandD',
    to: '/$shop/settings/brand',
    anyOf: [Permission.SettingsManage],
  },
  {
    icon: 'globe',
    title: 'sStore',
    sub: 'sStoreD',
    to: '/$shop/settings/storefront',
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

// What the shop will set up later, greyed with the phase it arrives in (the prototype's "Coming later").
const LATER: readonly { icon: IconName; title: string; phase: number }[] = [
  { icon: 'banknote', title: 'sMethods', phase: 5 },
  { icon: 'box', title: 'sCourier', phase: 6 },
  { icon: 'smartphone', title: 'sListener', phase: 5 },
  { icon: 'sms', title: 'sSms', phase: 7 },
  { icon: 'bell', title: 'sNotif', phase: 7 },
];

/**
 * Settings (TENANT-DASHBOARD-DESIGN §7.16, the prototype's `settings`): the shop's own settings as rows into their
 * pages, each as its permission allows, then what comes later with its phase.
 */
export function SettingsView(): React.JSX.Element {
  const { t } = useTranslation('menu');
  const { t: shell } = useTranslation('shell');
  const { t: home } = useTranslation('home');
  const { slug, viewer } = useShell();
  const rows = ROWS.filter((row) =>
    row.anyOf === 'owner' ? viewer.isOwner : allows(viewer, row.anyOf),
  );
  return (
    <ShellPage>
      {rows.length > 0 ? (
        <Card flush>
          <RowList>
            {rows.map((row) => (
              <Link key={row.to} to={row.to} params={{ shop: slug }} className={menuRowClass}>
                <MenuRowInner icon={row.icon} title={shell(row.title)} sub={t(row.sub)} />
              </Link>
            ))}
          </RowList>
        </Card>
      ) : null}
      <div className="flex flex-col gap-2">
        <Eyebrow>{t('comingLater')}</Eyebrow>
        <Card flush>
          <RowList>
            {LATER.map((row) => (
              <div
                key={row.title}
                aria-disabled="true"
                className={`${menuRowClass} min-h-[52px] opacity-55`}
              >
                <MenuRowInner icon={row.icon} title={t(row.title)} chevron={false} />
                <PhasePill>{shell('laterPhase', { p: home('phase', { n: row.phase }) })}</PhasePill>
              </div>
            ))}
          </RowList>
        </Card>
      </div>
    </ShellPage>
  );
}
