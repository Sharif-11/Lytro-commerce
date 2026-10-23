import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ShopMark } from '@/components/ui/shop-mark';
import { appConfig } from '@/lib/app-config';
import { hubOf, visibleSections } from './hubs';
import { useShell } from './shell-context';

/**
 * TENANT-DASHBOARD-DESIGN §4.3, the prototype's `.secnav`: from 1280 px, a 224 px white column with the shop's name
 * and address, the hub's label and its sections as text rows with their counts; it replaces the section chips. Home
 * and Orders have no sections, so no column.
 */
export function SideColumn(): React.JSX.Element | null {
  const { t } = useTranslation('shell');
  const { slug, tenant, viewer, screen, counts } = useShell();
  if (!screen) return null;
  const hub = hubOf(screen.hub);
  const sections = visibleSections(hub, viewer);
  if (sections.length === 0) return null;
  return (
    <nav
      aria-label={t('sectionNav')}
      className="hidden w-56 flex-none flex-col border-r border-line bg-surface px-3 py-4 xl:flex"
    >
      <div className="mb-3 flex items-center gap-2.5 border-b border-line px-2 pt-1 pb-4">
        <ShopMark shopName={tenant.shopName} slug={slug} logo={tenant.logo} size={40} />
        <div className="min-w-0">
          <div className="text-[15px] leading-[1.3] font-semibold">{tenant.shopName}</div>
          {/* A long address stays on one line, cut, and shows whole on hover (found with real data, Slice 11.4b). */}
          <div
            title={appConfig.shopHost(slug)}
            className="overflow-hidden text-[12px] text-ellipsis whitespace-nowrap text-fg-subtle"
          >
            {appConfig.shopHost(slug)}
          </div>
        </div>
      </div>
      <div className="px-2 pt-2 pb-1 text-[12px] font-semibold tracking-[0.06em] text-fg-subtle uppercase [html[lang=bn]_&]:text-[13px] [html[lang=bn]_&]:tracking-normal [html[lang=bn]_&]:normal-case">
        {t(hub.label)}
      </div>
      {sections.map((section) => {
        const on = screen.section === section.id;
        const count = section.id === 'stock' ? counts.stock : null;
        return (
          <Link
            key={section.id}
            to={section.path}
            params={{ shop: slug }}
            aria-current={on ? 'page' : undefined}
            className={[
              'relative flex h-10 items-center justify-between rounded-[8px] px-2.5 text-[14px]',
              on
                ? 'bg-primary-soft font-semibold text-primary before:absolute before:top-2 before:bottom-2 before:-left-3 before:w-[3px] before:rounded-r-[3px] before:bg-primary'
                : 'font-medium text-fg-muted',
            ].join(' ')}
          >
            <span>{t(section.label)}</span>
            {count ? (
              <span className="num inline-flex h-[18px] items-center rounded-full bg-neutral-100 px-1.5 text-[12px] font-semibold text-fg-muted">
                {count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
