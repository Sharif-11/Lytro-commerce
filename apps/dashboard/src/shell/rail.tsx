import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/icon';
import { ShopMark } from '@/components/ui/shop-mark';
import { visibleHubs } from './hubs';
import { useShell } from './shell-context';

/**
 * TENANT-DASHBOARD-DESIGN §4.3, the prototype's `.rail`: from 1024 px, 72 px of chrome teal-900 -- the only
 * chrome-coloured surface -- with the hubs' icons over 11 px labels, teal-800 behind the active one, and the shop's
 * mark with "Powered by Lytro" at its foot (TEN-18).
 */
export function Rail(): React.JSX.Element {
  const { t } = useTranslation('shell');
  const { slug, tenant, viewer, screen, counts } = useShell();
  return (
    <nav
      aria-label={t('mainNav')}
      className="hidden w-[72px] flex-none flex-col items-center gap-1 bg-chrome py-3 text-white lg:flex"
    >
      {visibleHubs(viewer).map(({ hub, to }) => {
        const on = screen?.hub === hub.id;
        const pill = hub.id === 'shop' ? counts.stock : null;
        return (
          <Link
            key={hub.id}
            to={to}
            params={{ shop: slug }}
            aria-current={on ? 'page' : undefined}
            className={[
              'relative flex h-14 w-[60px] flex-col items-center justify-center gap-1 rounded-[10px] text-[11px]',
              on ? 'bg-brand-800 font-semibold text-white' : 'font-medium text-[#cfe3e0]',
            ].join(' ')}
          >
            <Icon name={hub.icon} size={22} />
            <span>{t(hub.label)}</span>
            {pill ? (
              <span className="num absolute top-1 right-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-[5px] text-[11px] font-semibold text-ink">
                {pill}
              </span>
            ) : null}
          </Link>
        );
      })}
      <span className="flex-1" />
      <div className="flex flex-col items-center gap-2.5 pb-1">
        <ShopMark
          shopName={tenant.shopName}
          slug={slug}
          logo={tenant.logo}
          className="border border-white/20"
        />
        {/* Inline on the text's baseline, as the prototype sets it, so its line keeps the mark's place. */}
        <span title={t('poweredBy')} className="text-neutral-300">
          <Icon name="mark" size={16} className="inline align-baseline" />
        </span>
      </div>
    </nav>
  );
}
