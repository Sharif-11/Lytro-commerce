import type { IconName } from '@lytronix/ui';

export type ConsoleSection =
  | 'payment-queue'
  | 'tenants'
  | 'plans'
  | 'billing-terms'
  | 'rates'
  | 'settings'
  | 'wallets'
  | 'account';

export interface NavItem {
  section: ConsoleSection;
  to:
    | '/payment-queue'
    | '/tenants'
    | '/plans'
    | '/billing-terms'
    | '/rates'
    | '/settings'
    | '/wallets'
    | '/account';
  labelKey: string;
  icon: IconName;
}

/** The one list of destinations the sidebar and the phone nav both render. Order follows how often an
    operator opens each: the queue and tenants daily, the catalogue rarely. No permission gating: the
    operator session guard alone gates every console route today. */
export const navItems: NavItem[] = [
  { section: 'payment-queue', to: '/payment-queue', labelKey: 'nav.paymentQueue', icon: 'wallet' },
  { section: 'tenants', to: '/tenants', labelKey: 'nav.tenants', icon: 'store' },
  { section: 'plans', to: '/plans', labelKey: 'nav.plans', icon: 'tag' },
  {
    section: 'billing-terms',
    to: '/billing-terms',
    labelKey: 'nav.billingTerms',
    icon: 'calendar',
  },
  { section: 'rates', to: '/rates', labelKey: 'nav.rates', icon: 'signal' },
  { section: 'settings', to: '/settings', labelKey: 'nav.settings', icon: 'settings' },
  { section: 'wallets', to: '/wallets', labelKey: 'nav.wallets', icon: 'phone' },
  { section: 'account', to: '/account', labelKey: 'nav.account', icon: 'shield' },
];
