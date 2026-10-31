import { ApiClientError } from '@lytronix/api-client';
import { formatTaka } from '@lytronix/ui';
import { Permission, UsageMetric } from '@lytronix/validators';
import { bangladeshiPhone } from '@/lib/phone';
import type { StaffMember } from '@/types/staff';
import type { ShopUsage } from '@/types/usage';

type T = (key: string, options?: Record<string, unknown>) => string;

/**
 * STF-07 (the prototype's Part 11): the permissions the role editor offers, those of the sections that exist today, in
 * its order, each in words; paying for the plan, add-ons and packs says it spends the balance. The rest join with their
 * phases.
 */
export const PERMISSION_ROWS: readonly { permission: Permission; label: string; note?: string }[] =
  [
    // Slice 4.8a: the orders, first, as the shop's daily work.
    { permission: Permission.OrdersRead, label: 'pmOrdersRead' },
    { permission: Permission.OrdersManage, label: 'pmOrdersManage' },
    { permission: Permission.OrdersDelete, label: 'pmOrdersDelete' },
    { permission: Permission.ProductsRead, label: 'pmProductsRead' },
    { permission: Permission.ProductsManage, label: 'pmProductsManage' },
    { permission: Permission.InventoryRead, label: 'pmStockRead' },
    { permission: Permission.InventoryManage, label: 'pmStockManage' },
    { permission: Permission.KeysManage, label: 'pmKeys' },
    { permission: Permission.StaffRead, label: 'pmStaffRead' },
    { permission: Permission.StaffManage, label: 'pmStaffManage' },
    { permission: Permission.BalanceRead, label: 'pmBalanceRead' },
    { permission: Permission.BalanceManage, label: 'pmBalanceManage' },
    { permission: Permission.PaymentsRead, label: 'pmPaymentsRead' },
    { permission: Permission.PaymentsManage, label: 'pmPaymentsManage', note: 'spends' },
    { permission: Permission.AuditRead, label: 'pmAudit' },
    { permission: Permission.SettingsManage, label: 'pmSettings' },
  ];

// A "see" permission and the "change" one that goes with it: a role holding both says only the second.
const CHANGES: Partial<Record<Permission, Permission>> = {
  [Permission.OrdersRead]: Permission.OrdersManage,
  [Permission.ProductsRead]: Permission.ProductsManage,
  [Permission.InventoryRead]: Permission.InventoryManage,
  [Permission.StaffRead]: Permission.StaffManage,
  [Permission.BalanceRead]: Permission.BalanceManage,
  [Permission.PaymentsRead]: Permission.PaymentsManage,
};

/** Part 12: what a role lets someone do, from its permissions in the editor's words -- a role has no description. */
export function roleLine(permissions: readonly string[], t: T): string {
  const held = new Set(permissions);
  return PERMISSION_ROWS.filter(({ permission }) => {
    if (!held.has(permission)) return false;
    const change = CHANGES[permission];
    return change === undefined || !held.has(change);
  })
    .map(({ label }) => t(label))
    .join(' · ');
}

/** A role as the editor holds it while it is changed. */
export interface RoleDraft {
  name: string;
  permissions: Permission[];
}

export const EMPTY_ROLE: RoleDraft = { name: '', permissions: [] };

/** The draft with one permission ticked or unticked. */
export function toggled(draft: RoleDraft, permission: Permission): RoleDraft {
  return {
    ...draft,
    permissions: draft.permissions.includes(permission)
      ? draft.permissions.filter((each) => each !== permission)
      : [...draft.permissions, permission],
  };
}

/** A refusal for want of a free seat (STF-02, STF-04), which opens the seat-full dialog instead of an error line. */
export function refusedForSeat(error: unknown): boolean {
  return error instanceof ApiClientError && error.code === 'plan_limit_reached';
}

/** A person as the list names them: their name, else their phone. */
export function personLabel(member: StaffMember): string {
  return member.name ?? (member.phone ? bangladeshiPhone.grouped(member.phone) : '');
}

/** The owner first, then the active, then the rest, each group as the server lists it. */
export function sortPeople(members: readonly StaffMember[]): StaffMember[] {
  return [...members].sort(
    (a, b) => Number(b.isOwner) - Number(a.isOwner) || Number(b.active) - Number(a.active),
  );
}

/** Whether every seat is in use (STF-02); unlimited seats never fill. */
export function seatsFull(seats: { used: number; total: number | null } | undefined): boolean {
  return seats !== undefined && seats.total !== null && seats.used >= seats.total;
}

/** STF-04: the ways to a seat the shop's usage suggests -- the seat add-on with its monthly price, and a plan. */
export interface SeatWays {
  seat: { key: string; monthly: number } | null;
  plan: { planId: string; name: string } | null;
}

export function seatWays(usage: ShopUsage | undefined): SeatWays {
  const ways: SeatWays = { seat: null, plan: null };
  const suggestions = usage?.suggestions;
  if (!suggestions) return ways;
  for (const suggestion of [suggestions.first, suggestions.alternative]) {
    if (suggestion?.kind === 'plan')
      ways.plan ??= { planId: suggestion.planId, name: suggestion.name };
    if (suggestion?.kind !== 'addons') continue;
    const item = suggestion.items.find((each) => each.metric === UsageMetric.Seats);
    if (item) ways.seat ??= { key: item.key, monthly: item.monthly / item.quantity };
  }
  return ways;
}

/**
 * The seat-full dialog's words (the prototype's `team-full-add`, `team-full-add-nopay`, `sh-staff-reactivate-full`):
 * what is in use, then the ways out the shop has -- or, to someone who may not pay, the one they can take.
 */
export function seatFullText(
  ask: { kind: 'add' } | { kind: 'reactivate'; name: string },
  seats: { used: number; total: number },
  ways: SeatWays,
  canPay: boolean,
  t: T,
): string {
  const lead =
    ask.kind === 'add'
      ? t('stAddFullLead', { total: seats.total })
      : t('stReactFullLead', { name: ask.name, used: seats.used, total: seats.total });
  if (!canPay) return `${lead} ${t('stWaysNoPay')}`;
  const prefix = ask.kind === 'add' ? 'stAddWays' : 'stWays';
  const words = {
    price: ways.seat ? formatTaka(ways.seat.monthly) : '',
    plan: ways.plan?.name ?? '',
  };
  const which = ways.seat ? (ways.plan ? 'Both' : 'Seat') : ways.plan ? 'Plan' : 'None';
  return `${lead} ${t(`${prefix}${which}`, words)}`;
}
