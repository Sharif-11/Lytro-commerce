import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Permission } from '@lytronix/validators';
import { useHelpLine } from '@/api/help-line';
import { useSignOut } from '@/api/me';
import { useStaffList } from '@/api/staff';
import { HelpSheet } from '@/components/help-sheet';
import { Icon, type IconName } from '@/components/icon';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { RowList } from '@/components/ui/list-row';
import { ShopMark } from '@/components/ui/shop-mark';
import { ShopSiteArrow, ShopSiteLink } from '@/components/shop-site-link';
import { useHelpSubLine } from '@/hooks/use-help-sub-line';
import { appConfig } from '@/lib/app-config';
import { helpLineReachable } from '@/lib/help-line';
import { installOffers, onIphoneBrowser, useInstallOffer } from '@/lib/install-prompt';
import { daysUntil } from '@lytronix/ui';
import { TenantState } from '@lytronix/validators';
import {
  allows,
  hubOf,
  MENU_MONEY_SECTIONS,
  sectionOf,
  visibleSections,
  type SectionId,
} from '@/shell/hubs';
import { useShell } from '@/shell/shell-context';
import { ShellPage } from '@/shell/shell-page';
import { TutorialsMenuRow } from '@/views/tutorials/menu-row';
import { InstallCard, menuRowClass, MenuRowInner } from './menu-parts';

// Each Menu section's icon (the prototype's `menuRow`).
const ICONS: Partial<Record<SectionId, IconName>> = {
  // Item 5.3 (the prototype's `ux-menu`): the Wallet's Plan, Billing and Usage.
  plan: 'layers',
  billing: 'file',
  usage: 'trend',
  team: 'users',
  activity: 'activity',
  // Phase 7 (Part 37's `p37-menu`): Lytro's notices, marigold, with the unread count and its dot.
  notices: 'megaphone',
  settings: 'settings',
  account: 'shield',
};

/**
 * The Menu hub's own page (TENANT-DASHBOARD-DESIGN §7.18, the prototype's `menu`, Part 11's `menu-staff` and the two
 * install cards): the shop with the person's role and name; Team, Activity and Settings as their permissions open them
 * (STF-11, hidden never disabled); Account, Language, Help and Sign out; "Powered by Lytro". Help opens Lytro support from
 * the help line the console sets (D8-4, Slice 8.8's `p88-menu`), for everyone on the team, and isn't there with no number.
 */
export function MenuView(): React.JSX.Element {
  const { t, i18n } = useTranslation('menu');
  const { t: shell } = useTranslation('shell');
  const { slug, tenant, viewer, personName, roles, counts } = useShell();
  const sections = visibleSections(hubOf('menu'), viewer).map((section) => section.id);
  const staff = useStaffList({ enabled: allows(viewer, [Permission.StaffRead]) });
  const signOut = useSignOut();
  const offered = useInstallOffer();
  const standalone = window.matchMedia('(display-mode: standalone)').matches;
  const onIphone = onIphoneBrowser(navigator, standalone);
  const helpLine = useHelpLine().data;
  const [helpOpen, setHelpOpen] = useState(false);

  const role = viewer.isOwner ? t('roleOwner') : roles.length > 0 ? roles.join(', ') : t('staffOf');
  const seats = staff.data?.seats;
  const subs: Partial<Record<SectionId, string | undefined>> = {
    team: seats
      ? seats.total === null
        ? t('mTeamSUnlimited', { used: seats.used })
        : t('mTeamS', { used: seats.used, total: seats.total })
      : undefined,
    activity: t('mActivityS'),
    notices: t('mNoticesS', { n: counts.notices ?? 0 }),
    settings: t('mSettingsS'),
    account: t('mAccountS'),
  };
  const sectionRow = (id: 'team' | 'activity' | 'notices' | 'settings' | 'account') => (
    <Link key={id} to={`/$shop/${id}`} params={{ shop: slug }} className={menuRowClass}>
      <MenuRowInner
        icon={ICONS[id] ?? 'menu'}
        title={
          id === 'notices' && counts.notices ? (
            <>
              {shell('secNotices')}{' '}
              <span
                className="inline-block size-2 rounded-full bg-accent align-middle"
                aria-hidden="true"
              />
            </>
          ) : (
            shell(`sec${id.charAt(0).toUpperCase()}${id.slice(1)}`)
          )
        }
        sub={subs[id]}
        tone={id === 'notices' ? 'mari' : undefined}
      />
    </Link>
  );
  const shopSections = (['team', 'activity', 'notices', 'settings'] as const).filter((id) =>
    sections.includes(id),
  );
  // §7.49 (`tv-menu`): Tutorials right under Notices, for everyone; before Settings where Notices isn't shown.
  const tutorialsAt = shopSections.includes('notices')
    ? shopSections.indexOf('notices') + 1
    : shopSections.filter((id) => id !== 'settings').length;
  const days = daysUntil(tenant.periodEnd);
  const planName =
    tenant.state === TenantState.Trial
      ? t('trial', { ns: 'money' })
      : tenant.state === TenantState.PayAsYouGo
        ? t('payg', { ns: 'money' })
        : (tenant.planName ?? '');
  const moneySubs: Partial<Record<SectionId, string>> = {
    plan:
      tenant.state === TenantState.PayAsYouGo || days === null
        ? planName
        : t('ux2.mPlanS', { plan: planName, n: days }),
    billing: t('ux2.mBillS'),
    usage: t('ux2.mUsageS'),
  };
  const moneySections = MENU_MONEY_SECTIONS.filter((id) => allows(viewer, sectionOf(id).anyOf));

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
      {/* The shop and you, with Sign out two taps from anywhere (the owner, 2026-11-19, the sketch's `bb-menu`): on a
          phone under them, full width; on a computer at their end. The old last row stays. */}
      <Card flush>
        <div className="flex min-h-16 flex-wrap items-center gap-3 px-4 py-3 lg:flex-nowrap">
          <ShopSiteLink className="flex min-w-0 flex-1 items-center gap-3">
            <ShopMark shopName={tenant.shopName} slug={slug} logo={tenant.logo} size={40} />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="flex min-w-0 items-center text-[16px] font-medium">
                <span className="overflow-hidden text-ellipsis whitespace-nowrap">
                  {tenant.shopName}
                </span>
                <ShopSiteArrow />
              </span>
              <span className="text-[14px] text-fg-muted">
                {[appConfig.shopHost(slug), role, personName].filter(Boolean).join(' · ')}
              </span>
            </span>
          </ShopSiteLink>
          <Button
            tone="outline"
            size="sm"
            disabled={signOut.isPending}
            onClick={() => {
              signOut.mutate();
            }}
            className="basis-full border-[color-mix(in_srgb,var(--color-danger)_40%,var(--color-line))] text-danger lg:basis-auto"
          >
            <Icon name="logout" size={16} /> {t('signOut')}
          </Button>
        </div>
      </Card>
      {moneySections.length > 0 ? (
        <Card flush>
          <RowList>
            {moneySections.map((id) => (
              <Link key={id} to={`/$shop/${id}`} params={{ shop: slug }} className={menuRowClass}>
                <MenuRowInner
                  icon={ICONS[id] ?? 'money'}
                  title={shell(sectionOf(id).label)}
                  sub={moneySubs[id]}
                />
              </Link>
            ))}
          </RowList>
        </Card>
      ) : null}
      <Card flush>
        <RowList>
          {shopSections.slice(0, tutorialsAt).map(sectionRow)}
          <TutorialsMenuRow />
          {shopSections.slice(tutorialsAt).map(sectionRow)}
        </RowList>
      </Card>
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
          {helpLineReachable(helpLine) ? (
            <button
              type="button"
              className={menuRowClass}
              onClick={() => {
                setHelpOpen(true);
              }}
            >
              <HelpRow line={helpLine} title={t('secHelp')} />
            </button>
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
      {helpOpen ? (
        <HelpSheet
          open
          onClose={() => {
            setHelpOpen(false);
          }}
        />
      ) : null}
    </ShellPage>
  );
}

/** The Help row's inside: the ways to reach Lytro, and open now or when it opens. */
function HelpRow({
  line,
  title,
}: {
  line: Parameters<typeof useHelpSubLine>[0];
  title: string;
}): React.JSX.Element {
  return <MenuRowInner icon="help" title={title} sub={useHelpSubLine(line, new Date())} />;
}
