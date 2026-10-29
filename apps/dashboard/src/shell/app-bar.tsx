import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/icon';
import { ShopMark } from '@/components/ui/shop-mark';
import { useShell } from './shell-context';

const iconButton =
  'relative inline-flex size-11 items-center justify-center rounded-button text-fg-muted';

interface BarActionsProps {
  canSearch: boolean;
  canAdd: boolean;
}

/**
 * TENANT-DASHBOARD-DESIGN §4.1, the prototype's `.appbar`: 56 px, white with a hairline, under 1024 px. A hub's page
 * shows the shop's mark and name; a page below it shows back and its own title. Search and the + menu sit on the
 * right (the bell joins in Phase 7).
 */
export function AppBar({ canSearch, canAdd }: BarActionsProps): React.JSX.Element {
  const { t } = useTranslation('shell');
  const { slug, tenant, screen, openPlus } = useShell();
  const back = screen?.back;
  const title = screen?.title;
  return (
    <div className="flex h-14 flex-none items-center gap-2 border-b border-line bg-surface pr-2 pl-4 lg:hidden [html[lang=bn]_&]:leading-[1.6]">
      {back ? (
        <Link
          to={back}
          params={{ shop: slug }}
          aria-label={t('back')}
          className={`${iconButton} -ml-2`}
        >
          <Icon name="left" />
        </Link>
      ) : null}
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        {back ? null : <ShopMark shopName={tenant.shopName} slug={slug} logo={tenant.logo} />}
        <span className="overflow-hidden text-[16px] font-semibold text-ellipsis whitespace-nowrap">
          {back && title ? t(title) : tenant.shopName}
        </span>
      </div>
      {canSearch ? (
        <Link
          to="/$shop/search"
          params={{ shop: slug }}
          aria-label={t('search')}
          className={iconButton}
        >
          <Icon name="search" />
        </Link>
      ) : null}
      {canAdd ? (
        <button type="button" aria-label={t('plusTitle')} onClick={openPlus} className={iconButton}>
          <Icon name="plus" />
        </button>
      ) : null}
    </div>
  );
}
