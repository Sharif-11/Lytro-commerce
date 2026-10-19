import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Icon } from '@lytronix/ui';
import { bottomNavItems } from './nav-items';

/** Phones and small tablets: five tabs, icon over label, 56 px tall plus the safe area. */
export function BottomNav({ slug }: { slug: string }): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <nav
      aria-label={t('nav.primary')}
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <ul className="grid grid-cols-5">
        {bottomNavItems.map((item) => (
          <li key={item.section}>
            <Link
              to={`/$shop${item.path}`}
              params={{ shop: slug }}
              className="flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold text-neutral-700"
              activeProps={{ className: 'text-brand-800' }}
            >
              <Icon name={item.icon} size={22} />
              {t(item.labelKey)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
