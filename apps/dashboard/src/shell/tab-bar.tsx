import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/icon';
import { visibleHubs } from './hubs';
import { useShell } from './shell-context';

/**
 * TENANT-DASHBOARD-DESIGN §4.1, the prototype's `.tabbar`: the five hubs under 1024 px, 64 px plus the phone's safe
 * area, the icon over an 11 px label, primary when active. Shop carries the low-stock count as a pill.
 */
export function TabBar(): React.JSX.Element {
  const { t } = useTranslation('shell');
  const { slug, viewer, screen, counts } = useShell();
  const hubs = visibleHubs(viewer);
  return (
    <nav
      aria-label={t('mainNav')}
      className="grid flex-none border-t border-line bg-surface pt-1 pb-[env(safe-area-inset-bottom)] lg:hidden [html[lang=bn]_&]:leading-[1.6]"
      style={{ gridTemplateColumns: `repeat(${String(hubs.length)}, 1fr)` }}
    >
      {hubs.map(({ hub, to }) => {
        const on = screen?.hub === hub.id;
        const pill = hub.id === 'shop' ? counts.stock : null;
        return (
          <Link
            key={hub.id}
            to={to}
            params={{ shop: slug }}
            aria-current={on ? 'page' : undefined}
            className={[
              // 64 px with its hairline and the 4 px above the tabs, as the prototype's border-box bar.
              'relative flex h-[59px] flex-col items-center justify-center gap-[3px] text-[11px]',
              on ? 'font-semibold text-primary' : 'font-medium text-fg-muted',
            ].join(' ')}
          >
            <Icon name={hub.icon} size={24} />
            <span>{t(hub.label)}</span>
            {pill ? (
              <span className="num absolute top-0.5 left-[calc(50%+6px)] flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-[5px] text-[11px] font-semibold text-on-primary">
                {pill}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
