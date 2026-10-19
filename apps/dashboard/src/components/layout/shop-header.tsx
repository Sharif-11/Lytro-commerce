import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Icon, LanguageToggle } from '@lytronix/ui';

interface ShopHeaderProps {
  slug: string;
  shopName: string;
}

/** The top strip on every screen: monogram, shop name, language toggle, the bell (ONBOARDING-FLOW-DESIGN
    §3). Notices have no backend yet, so the bell is a quiet placeholder with no count. */
export function ShopHeader({ slug, shopName }: ShopHeaderProps): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-white/90 backdrop-blur-md">
      <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
        <Link
          to="/$shop"
          params={{ shop: slug }}
          className="flex min-w-0 items-center gap-2.5"
          aria-label={shopName}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-700 text-[15px] font-extrabold text-white lg:hidden">
            {shopName.slice(0, 1).toUpperCase()}
          </span>
          <span className="truncate text-[16px] font-bold text-ink">{shopName}</span>
        </Link>
        <div className="ml-auto flex items-center gap-2">
          <LanguageToggle />
          <span
            className="inline-flex h-10 w-10 items-center justify-center rounded-control text-neutral-700"
            title={t('nav.notices')}
          >
            <Icon name="bell" size={22} />
          </span>
        </div>
      </div>
    </header>
  );
}
