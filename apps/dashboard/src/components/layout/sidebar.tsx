import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Icon, PoweredByLytro, Wordmark } from '@lytronix/ui';
import { navItems } from './nav-items';

interface SidebarProps {
  slug: string;
  shopName: string;
}

/** Desktop and tablet (900 px up): the fixed dark sidebar with the destinations from nav-items.ts and the
    persistent "Powered by Lytro" at its foot (TEN-18). Presentational: everything comes in as props. */
export function Sidebar({ slug, shopName }: SidebarProps): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-sidebar text-white lg:flex">
      <div className="flex h-16 items-center px-5">
        <Wordmark height={26} tone="light" />
      </div>
      <div className="mx-4 flex items-center gap-3 rounded-card bg-white/8 px-3 py-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-[15px] font-extrabold text-brand-800">
          {shopName.slice(0, 1).toUpperCase()}
        </span>
        <span className="truncate text-[15px] font-bold">{shopName}</span>
      </div>
      <nav className="mt-4 flex-1 space-y-0.5 px-3" aria-label={t('nav.primary')}>
        {navItems.map((item) => (
          <Link
            key={item.section}
            to={`/$shop${item.path}`}
            params={{ shop: slug }}
            activeOptions={{ exact: item.path === '' }}
            className="flex min-h-11 items-center gap-3 rounded-control px-3 text-[15px] font-semibold text-white/80 hover:bg-white/8 hover:text-white"
            activeProps={{ className: 'bg-white/12 text-white' }}
          >
            <Icon name={item.icon} size={20} />
            {t(item.labelKey)}
          </Link>
        ))}
      </nav>
      <div className="border-t border-sidebar-line px-5 py-4">
        <PoweredByLytro tone="light" />
      </div>
    </aside>
  );
}
