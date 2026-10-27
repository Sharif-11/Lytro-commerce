import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Permission } from '@lytronix/validators';
import { useSignOut } from '@/api/me';
import { useStaffList } from '@/api/staff';
import { Icon, type IconName } from '@/components/icon';
import { Card } from '@/components/ui/card';
import { RowList } from '@/components/ui/list-row';
import { ShopMark } from '@/components/ui/shop-mark';
import { appConfig } from '@/lib/app-config';
import { installOffers, onIphoneBrowser, useInstallOffer } from '@/lib/install-prompt';
import { allows, hubOf, visibleSections, type SectionId } from '@/shell/hubs';
import { useShell } from '@/shell/shell-context';
import { ShellPage } from '@/shell/shell-page';
import { InstallCard, menuRowClass, MenuRowInner } from './menu-parts';

// Each Menu section's icon (the prototype's `menuRow`).
const ICONS: Record<'team' | 'activity' | 'settings' | 'account', IconName> = {
  team: 'users',
  activity: 'activity',
  settings: 'settings',
  account: 'shield',
};

/**
 * The Menu hub's own page (TENANT-DASHBOARD-DESIGN §7.18, the prototype's `menu`, Part 11's `menu-staff` and the two
 * install cards): the shop with the person's role and name; Team, Activity and Settings as their permissions open them
 * (STF-11, hidden never disabled); Account, Language, Help and Sign out; "Powered by Lytro".
 */
export function MenuView(): React.JSX.Element {
  const { t, i18n } = useTranslation('menu');
  const { t: shell } = useTranslation('shell');
  const { slug, tenant, viewer, personName, roles } = useShell();
  const sections = visibleSections(hubOf('menu'), viewer).map((section) => section.id);
  const staff = useStaffList({ enabled: allows(viewer, [Permission.StaffRead]) });
  const signOut = useSignOut();
  const offered = useInstallOffer();
  const standalone = window.matchMedia('(display-mode: standalone)').matches;
  const onIphone = onIphoneBrowser(navigator, standalone);
  const help = appConfig.supportChatUrl();

  const role = viewer.isOwner ? t('roleOwner') : roles.length > 0 ? roles.join(', ') : t('staffOf');
  const seats = staff.data?.seats;
  const subs: Partial<Record<SectionId, string | undefined>> = {
    team: seats
      ? seats.total === null
        ? t('mTeamSUnlimited', { used: seats.used })
        : t('mTeamS', { used: seats.used, total: seats.total })
      : undefined,
    activity: t('mActivityS'),
    settings: t('mSettingsS'),
    account: t('mAccountS'),
  };
  const sectionRow = (id: 'team' | 'activity' | 'settings' | 'account') => (
    <Link key={id} to={`/$shop/${id}`} params={{ shop: slug }} className={menuRowClass}>
      <MenuRowInner
        icon={ICONS[id]}
        title={shell(`sec${id.charAt(0).toUpperCase()}${id.slice(1)}`)}
        sub={subs[id]}
      />
    </Link>
  );
  const shopSections = (['team', 'activity', 'settings'] as const).filter((id) =>
    sections.includes(id),
  );

  return (
    <ShellPage>
      {(offered || onIphone) && !standalone ? (
        <div className="sm:hidden">
          <InstallCard
            shopName={tenant.shopName}
            slug={slug}
            onIphone={onIphone}
            onInstall={() => {
              installOffers.install();
            }}
          />
        </div>
      ) : null}
      <Card flush>
        <div className="flex min-h-16 items-center gap-3 px-4 py-3">
          <ShopMark shopName={tenant.shopName} slug={slug} logo={tenant.logo} size={40} />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="overflow-hidden text-[16px] font-medium text-ellipsis whitespace-nowrap">
              {tenant.shopName}
            </span>
            <span className="overflow-hidden text-[14px] text-ellipsis whitespace-nowrap text-fg-muted">
              {[appConfig.shopHost(slug), role, personName].filter(Boolean).join(' · ')}
            </span>
          </span>
        </div>
      </Card>
      {shopSections.length > 0 ? (
        <Card flush>
          <RowList>{shopSections.map(sectionRow)}</RowList>
        </Card>
      ) : null}
      <Card flush>
        <RowList>
          {sectionRow('account')}
          <button
            type="button"
            className={menuRowClass}
            onClick={() => {
              void i18n.changeLanguage(i18n.language === 'bn' ? 'en' : 'bn');
            }}
          >
            <MenuRowInner icon="globe" title={t('language')} sub={t('langV')} chevron={false} />
          </button>
          {help ? (
            <a href={help} target="_blank" rel="noopener noreferrer" className={menuRowClass}>
              <MenuRowInner icon="help" title={t('secHelp')} sub={t('mHelpS')} />
            </a>
          ) : null}
          <button
            type="button"
            className={menuRowClass}
            disabled={signOut.isPending}
            onClick={() => {
              signOut.mutate();
            }}
          >
            <MenuRowInner icon="logout" title={t('signOut')} chevron={false} danger />
          </button>
        </RowList>
      </Card>
      <p className="flex items-center justify-center gap-1.5 p-2 text-[13px] text-neutral-500">
        <Icon name="mark" size={16} />
        {shell('poweredBy')}
      </p>
    </ShellPage>
  );
}
