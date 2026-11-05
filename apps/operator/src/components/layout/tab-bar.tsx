import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import type { ShellCounts } from '@/api/shell-counts';
import { ConsoleIcon } from '@/components/ui/console-icon';
import { CountBadge } from './count-badge';
import { phoneTabs } from './nav-items';

const TAB =
  'relative flex flex-col items-center justify-center gap-[3px] text-[11px] font-medium text-neutral-700';
const BADGE = 'absolute top-0.5 left-[calc(50%+6px)] h-[18px] min-w-[18px] px-[5px] text-[11px]';

/** The phone's four tabs: Today, the queue with its count, Shops, More. */
export function TabBar({
  counts,
  onMore,
}: {
  counts: ShellCounts;
  onMore: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <nav
      aria-label={t('nav.tabs')}
      className="grid min-h-16 flex-none grid-cols-4 border-t border-line bg-surface pt-1 pb-[env(safe-area-inset-bottom)] sm:hidden"
    >
      {phoneTabs.map((tab) => (
        <Link
          key={tab.to}
          to={tab.to}
          className={TAB}
          activeProps={{ className: 'font-semibold! text-primary!' }}
        >
          <ConsoleIcon name={tab.icon} size={24} />
          <span>{t(tab.labelKey)}</span>
          <CountBadge count={tab.count ? counts[tab.count] : 0} className={BADGE} />
        </Link>
      ))}
      <button type="button" onClick={onMore} className={TAB}>
        <ConsoleIcon name="menu" size={24} />
        <span>{t('nav.more')}</span>
      </button>
    </nav>
  );
}
