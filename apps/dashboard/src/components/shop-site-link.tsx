import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useShopSettings } from '@/api/shop-settings';
import { Icon } from '@/components/icon';
import { useShopAddress } from '@/hooks/use-shop-address';
import { useShell } from '@/shell/shell-context';

/**
 * The owner, 2026-11-26: "the shop name in dashboard must be directed to customer storefront". Where the storefront
 * opens from the shop's name and mark: its own domain while that serves, else its Lytro address (Home's link card's
 * address, `useShopAddress`). Null while the storefront is off, when they stay plain text; a paused shop still links,
 * as its storefront says itself that it is paused.
 */
export function useShopSite(): string | null {
  const settings = useShopSettings();
  const { url } = useShopAddress();
  return settings.data?.storefrontEnabled === false ? null : url;
}

/** The shop's name and mark as a link to its storefront, in a new tab; plain while the storefront is off. */
export function ShopSiteLink({
  className,
  decorative = false,
  children,
}: {
  className?: string;
  /** A second link beside the name (the app bar's mark): out of the tab order and hidden from screen readers. */
  decorative?: boolean;
  children: ReactNode;
}): React.JSX.Element {
  const { t } = useTranslation('shell');
  const { tenant } = useShell();
  const url = useShopSite();
  if (url === null) return <span className={className}>{children}</span>;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener"
      className={className}
      {...(decorative
        ? { tabIndex: -1, 'aria-hidden': true }
        : { 'aria-label': t('viewShop', { name: tenant.shopName }) })}
    >
      {children}
    </a>
  );
}

/** The small ↗ after the shop's name, so a seller knows it opens the shop; none while the storefront is off. */
export function ShopSiteArrow(): React.JSX.Element | null {
  return useShopSite() === null ? null : (
    <Icon
      name="external"
      size={13}
      className="ml-1 inline-block flex-none align-[-1px] text-fg-subtle"
    />
  );
}
