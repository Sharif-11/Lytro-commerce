import type { IconName } from '@lytronix/ui';

export type ShopSection = 'home' | 'orders' | 'products' | 'customers' | 'balance' | 'more';

export interface NavItem {
  section: ShopSection;
  /** Path under `/$shop`; '' is the home. */
  path: '' | '/orders' | '/products' | '/customers' | '/balance' | '/more';
  labelKey: string;
  icon: IconName;
}

/** The one list of destinations both the sidebar and the bottom tabs render (ONBOARDING-FLOW-DESIGN §3,
    open/closed per ENGINEERING-STANDARDS §2a). Phones show five tabs; the sidebar shows the same five. */
export const navItems: NavItem[] = [
  { section: 'home', path: '', labelKey: 'nav.home', icon: 'home' },
  { section: 'orders', path: '/orders', labelKey: 'nav.orders', icon: 'orders' },
  { section: 'products', path: '/products', labelKey: 'nav.products', icon: 'box' },
  { section: 'customers', path: '/customers', labelKey: 'nav.customers', icon: 'users' },
  { section: 'balance', path: '/balance', labelKey: 'nav.balance', icon: 'wallet' },
  { section: 'more', path: '/more', labelKey: 'nav.more', icon: 'more' },
];

/** The bottom bar has room for five: Orders, Products, Customers, Balance, More; home is the shop name. */
export const bottomNavItems = navItems.filter((item) => item.section !== 'home');
