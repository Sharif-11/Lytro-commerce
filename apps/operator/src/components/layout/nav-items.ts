import type { ConsoleIconName } from '@/components/ui/console-icon';

export type ConsolePath =
  | '/'
  | '/queue'
  | '/page-reports'
  | '/shops'
  | '/plans'
  | '/billing-terms'
  | '/rates'
  | '/addons'
  | '/settings'
  | '/wallets'
  | '/phones'
  | '/catalogue/shop-types'
  | '/catalogue/attributes'
  | '/catalogue/option-sets'
  | '/reports'
  | '/audit'
  | '/inbox'
  | '/notices'
  | '/verification'
  | '/manual'
  | '/account';

export type NavCount = 'queue' | 'reports';

export interface NavItem {
  to: ConsolePath;
  labelKey: string;
  icon: ConsoleIconName;
  count?: NavCount;
}

export interface NavGroup {
  labelKey: string;
  /** Drawn for later work (OPERATOR-CONSOLE-DESIGN rule 8): each carries "soon". */
  later?: boolean;
  items: NavItem[];
}

/** The one list of destinations the sidebar and the phone's More sheet both render, by how often each is opened. */
export const navGroups: NavGroup[] = [
  {
    labelKey: 'nav.daily',
    items: [
      { to: '/', labelKey: 'nav.today', icon: 'home' },
      { to: '/queue', labelKey: 'nav.paymentQueue', icon: 'queue', count: 'queue' },
      { to: '/page-reports', labelKey: 'nav.pageReports', icon: 'flag', count: 'reports' },
      { to: '/shops', labelKey: 'nav.shops', icon: 'store' },
    ],
  },
  {
    labelKey: 'nav.pricing',
    items: [
      { to: '/plans', labelKey: 'nav.plans', icon: 'tag' },
      { to: '/billing-terms', labelKey: 'nav.billingTerms', icon: 'calendar' },
      { to: '/rates', labelKey: 'nav.rates', icon: 'signal' },
      { to: '/addons', labelKey: 'nav.addons', icon: 'dollar' },
    ],
  },
  {
    labelKey: 'nav.platform',
    items: [
      { to: '/settings', labelKey: 'nav.settings', icon: 'settings' },
      { to: '/wallets', labelKey: 'nav.wallets', icon: 'wallet' },
      { to: '/phones', labelKey: 'nav.phones', icon: 'phone' },
    ],
  },
  {
    labelKey: 'nav.catalogue',
    items: [
      { to: '/catalogue/shop-types', labelKey: 'nav.shopTypes', icon: 'layers' },
      { to: '/catalogue/attributes', labelKey: 'nav.attributes', icon: 'list' },
      { to: '/catalogue/option-sets', labelKey: 'nav.optionSets', icon: 'grid' },
    ],
  },
  {
    labelKey: 'nav.later',
    later: true,
    items: [
      { to: '/reports', labelKey: 'nav.reports', icon: 'chart' },
      { to: '/audit', labelKey: 'nav.audit', icon: 'history' },
      { to: '/inbox', labelKey: 'nav.inbox', icon: 'inbox' },
      { to: '/notices', labelKey: 'nav.notices', icon: 'bell' },
      { to: '/verification', labelKey: 'nav.verification', icon: 'id' },
      { to: '/manual', labelKey: 'nav.manual', icon: 'dollar' },
    ],
  },
];

/** The phone's four tabs; the fourth, More, opens the sheet. */
export const phoneTabs: NavItem[] = [
  { to: '/', labelKey: 'nav.today', icon: 'home' },
  { to: '/queue', labelKey: 'nav.paymentQueue', icon: 'queue', count: 'queue' },
  { to: '/shops', labelKey: 'nav.shops', icon: 'store' },
];

const ACCOUNT = '/account';

/** What the phone's band names on this page; Today, the home of the console, shows the wordmark instead. */
export function bandTitleKey(pathname: string): string | null {
  if (pathname === ACCOUNT) return 'nav.account';
  const item = navGroups
    .flatMap((group) => group.items)
    .find(({ to }) => to !== '/' && (pathname === to || pathname.startsWith(`${to}/`)));
  return item?.labelKey ?? null;
}
