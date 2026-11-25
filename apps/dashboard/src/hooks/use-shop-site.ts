import { useShopSettings } from '@/api/shop-settings';
import { useShopAddress } from './use-shop-address';

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
