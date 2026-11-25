import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DashboardAppIcon } from '@/components/app-icon';
import { Icon } from '@/components/icon';
import { Button } from '@/components/ui/button';
import { buttonClass } from '@/components/ui/classes';
import {
  closeInstallRow,
  inChromeLink,
  installOffers,
  installRowClosed,
  installWayOf,
  useInstallOffer,
} from '@/lib/install-prompt';

/**
 * TEN-17, TENANT-DASHBOARD-DESIGN §7.1a (the prototype's `app-first*` and `app-home*`; the owner, 2026-11-26: "The app
 * install instruction must appear after signup so that they can install the app immediately"): one short row on top of
 * the first landing and of Home, on a phone, until the app is installed or the row is closed. Its one action follows the
 * browser: Install where Chrome offers it; Open in Chrome from Facebook's own browser on Android, to the shop's Home
 * there; Apple's two taps on an iPhone; the ⋮ menu anywhere else.
 */
export function InstallRow({
  shopName,
  slug,
}: {
  shopName: string;
  slug: string;
}): React.JSX.Element | null {
  const { t } = useTranslation('home');
  const offered = useInstallOffer();
  const [closed, setClosed] = useState(installRowClosed);
  // Installed from Chrome's own menu, or the offer just used: gone for this visit (the next one opens installed).
  const [done, setDone] = useState(false);
  useEffect(() => {
    const installed = (): void => {
      setDone(true);
    };
    window.addEventListener('appinstalled', installed);
    return () => {
      window.removeEventListener('appinstalled', installed);
    };
  }, []);
  const standalone = window.matchMedia('(display-mode: standalone)').matches;
  const way = installWayOf(navigator.userAgent, standalone, offered);
  if (way === null || closed || done) return null;

  const inline = way === 'offer';
  const steps =
    way === 'iphone'
      ? t('irIphone')
      : way === 'iphone-in-app'
        ? t('irIphoneInApp')
        : way === 'menu'
          ? t('irMenu')
          : null;
  return (
    <div
      className={[
        'flex gap-2.5 rounded-[12px] border border-brand-200 bg-primary-soft py-2.5 pr-1.5 pl-3 sm:hidden',
        inline ? 'items-center' : 'items-start',
      ].join(' ')}
    >
      <DashboardAppIcon shopName={shopName} slug={slug} size={40} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[15px] font-semibold text-fg">{t('irTitle')}</span>
        {steps ? <span className="mt-0.5 text-[13px] text-fg-muted">{steps}</span> : null}
        {way === 'open-in-chrome' ? (
          <a
            className={`${buttonClass('primary', 'sm')} mt-2 self-start no-underline`}
            href={inChromeLink(window.location, `/${slug}`)}
          >
            {t('irOpenInChrome')}
          </a>
        ) : null}
      </span>
      {inline ? (
        <Button
          size="sm"
          onClick={() => {
            installOffers.install();
            setDone(true);
          }}
        >
          {t('irInstall')}
        </Button>
      ) : null}
      <button
        type="button"
        aria-label={t('irLater')}
        className="flex size-9 flex-none items-center justify-center rounded-[8px] text-neutral-700"
        onClick={() => {
          closeInstallRow();
          setClosed(true);
        }}
      >
        <Icon name="x" size={18} />
      </button>
    </div>
  );
}
