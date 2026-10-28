import { Permission } from '@lytronix/validators';
import type { IconName } from '@/components/icon';

export type HubId = 'home' | 'orders' | 'shop' | 'money' | 'menu';

export type SectionId =
  | 'products'
  | 'categories'
  | 'attributes'
  | 'stock'
  | 'purchases'
  | 'delivery'
  | 'balance'
  | 'plan'
  | 'billing'
  | 'usage'
  | 'team'
  | 'activity'
  | 'settings'
  | 'account';

/** A path under `/$shop`, as the router knows it. */
export type ShopPath =
  | '/$shop'
  | '/$shop/orders'
  | '/$shop/menu'
  | '/$shop/search'
  | `/$shop/${SectionId}`
  // Below a section, where a screen's Back leads (a stock check returns to the list of checks).
  | '/$shop/stock/checks';

export interface Section {
  id: SectionId;
  path: ShopPath;
  /** Its name in the shell dictionary. */
  label: string;
  /** Shown to a staff member who holds any one of these; the owner sees every section (STF-11). */
  anyOf: readonly Permission[];
}

export interface Hub {
  id: HubId;
  icon: IconName;
  label: string;
  /** Where the hub's tab goes when it has no sections of its own. */
  root: ShopPath;
  /** Who sees a hub without sections; a hub with sections shows while any of them shows. */
  anyOf: readonly Permission[];
  sections: readonly Section[];
}

function section(id: SectionId, anyOf: readonly Permission[]): Section {
  return {
    id,
    path: `/$shop/${id}`,
    label: `sec${id.charAt(0).toUpperCase()}${id.slice(1)}`,
    anyOf,
  };
}

// TENANT-DASHBOARD-DESIGN §3: the five hubs and the sections of the current state, as the prototype draws them
// (docs/brand/lytro-dashboard.html, HUBS_CURRENT). Each section needs the permission its own read needs on the
// server; Orders shows its Phase 4 placeholder to whoever may later read orders. Add-ons is reached from Usage,
// Plan and the brand editor, not from the hub's own list.
export const HUBS: readonly Hub[] = [
  { id: 'home', icon: 'home', label: 'hubHome', root: '/$shop', anyOf: [], sections: [] },
  {
    id: 'orders',
    icon: 'orders',
    label: 'hubOrders',
    root: '/$shop/orders',
    anyOf: [Permission.OrdersRead],
    sections: [],
  },
  {
    id: 'shop',
    icon: 'shop',
    label: 'hubShop',
    root: '/$shop/products',
    anyOf: [],
    sections: [
      section('products', [Permission.ProductsRead]),
      section('categories', [Permission.ProductsRead]),
      section('attributes', [Permission.ProductsRead]),
      section('stock', [Permission.InventoryRead]),
      section('purchases', [Permission.InventoryRead]),
      section('delivery', [Permission.ProductsRead]),
    ],
  },
  {
    id: 'money',
    icon: 'money',
    label: 'hubMoney',
    root: '/$shop/balance',
    anyOf: [],
    sections: [
      section('balance', [Permission.BalanceRead]),
      section('plan', [Permission.PaymentsRead]),
      section('billing', [Permission.PaymentsRead]),
      section('usage', [Permission.PaymentsRead]),
    ],
  },
  {
    id: 'menu',
    icon: 'menu',
    label: 'hubMenu',
    root: '/$shop/menu',
    anyOf: [],
    sections: [
      section('team', [Permission.StaffRead]),
      section('activity', [Permission.AuditRead]),
      section('settings', [Permission.SettingsManage, Permission.KeysManage]),
      section('account', []),
    ],
  },
];

/** What decides what a person sees: the owner sees everything; staff see what their permissions reach. */
export interface Viewer {
  isOwner: boolean;
  permissions: readonly string[];
}

export function allows(viewer: Viewer, anyOf: readonly Permission[]): boolean {
  return viewer.isOwner || anyOf.length === 0 || anyOf.some((p) => viewer.permissions.includes(p));
}

/** A hub's sections this person may open, in order (STF-11: hidden, never disabled). */
export function visibleSections(hub: Hub, viewer: Viewer): Section[] {
  return hub.sections.filter((s) => allows(viewer, s.anyOf));
}

/** The hubs this person sees, each with where its tab goes: its root, or its first section they may open. */
export function visibleHubs(viewer: Viewer): { hub: Hub; to: ShopPath }[] {
  return HUBS.flatMap((hub) => {
    if (hub.sections.length === 0) return allows(viewer, hub.anyOf) ? [{ hub, to: hub.root }] : [];
    const sections = visibleSections(hub, viewer);
    const first = sections[0];
    if (!first) return [];
    // Menu opens its own page; the other hubs open their first section.
    return [{ hub, to: hub.id === 'menu' ? hub.root : first.path }];
  });
}

export function hubOf(id: HubId): Hub {
  const hub = HUBS.find((each) => each.id === id);
  if (!hub) throw new Error(`no hub ${id}`);
  return hub;
}

export function sectionOf(id: SectionId): Section {
  for (const hub of HUBS) {
    const found = hub.sections.find((each) => each.id === id);
    if (found) return found;
  }
  throw new Error(`no section ${id}`);
}

/** Whether the + menu holds anything this person can start now (§4.5); the + is hidden when it would not. */
export function hasPlusActions(viewer: Viewer): boolean {
  return allows(viewer, [Permission.BalanceManage]);
}
