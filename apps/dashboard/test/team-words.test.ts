import { describe, expect, it } from 'vitest';
import { ApiClientError } from '@lytronix/api-client';
import { Permission, UsageMetric } from '@lytronix/validators';
import bn from '../src/i18n/locales/menu/bn.json';
import en from '../src/i18n/locales/menu/en.json';
import { FirstPassword, PASSWORD_LETTERS } from '../src/lib/first-password';
import type { StaffMember } from '../src/types/staff';
import type { ShopUsage, SuggestedAddon, Suggestion } from '../src/types/usage';
import {
  EMPTY_ROLE,
  PERMISSION_ROWS,
  personLabel,
  refusedForSeat,
  roleLine,
  seatFullText,
  seatsFull,
  seatWays,
  sortPeople,
  toggled,
} from '../src/views/team/team-words';

// The key and its values, so the wording is checked without the dictionary.
const t = (key: string, options?: Record<string, unknown>): string =>
  options ? `${key} ${JSON.stringify(options)}` : key;

function memberOf(given: Partial<StaffMember>): StaffMember {
  return {
    id: 'u-1',
    phone: '+8801611222333',
    name: 'Kamal',
    isOwner: false,
    active: true,
    createdAt: '2026-10-01T04:00:00.000Z',
    mustSetPassword: false,
    roleIds: [],
    ...given,
  };
}

function usageWith(suggestions: ShopUsage['suggestions']): ShopUsage {
  return {
    cycleStart: '2026-10-01T00:00:00.000Z',
    cycleEnd: '2026-11-01T00:00:00.000Z',
    metrics: [],
    bandwidthDays: [],
    requestDays: [],
    suggestions,
    fastSpendAlertedAt: null,
    packs: [],
  };
}

const GROWTH: Suggestion = {
  kind: 'plan',
  planId: 'growth',
  name: 'Growth',
  price: 699,
  months: 1,
  monthly: 699,
};
const ONE_SEAT: SuggestedAddon = {
  addonId: 'a-seat',
  key: 'extra_seat',
  name: 'One seat',
  metric: UsageMetric.Seats,
  quantity: 1,
  monthly: 49,
};
const SEAT: Suggestion = { kind: 'addons', items: [ONE_SEAT], monthly: 49 };

describe('the role editor', () => {
  it('offers the thirteen permissions of the sections that exist, paying saying it spends the balance', () => {
    expect(PERMISSION_ROWS).toHaveLength(13);
    expect(PERMISSION_ROWS.filter((row) => row.note).map((row) => row.permission)).toEqual([
      Permission.PaymentsManage,
    ]);
    for (const row of PERMISSION_ROWS) {
      expect((bn as Record<string, unknown>)[row.label], row.label).toBeTypeOf('string');
      expect((en as Record<string, unknown>)[row.label], row.label).toBeTypeOf('string');
    }
  });

  it('ticks and unticks one permission at a time', () => {
    const once = toggled(EMPTY_ROLE, Permission.AuditRead);
    expect(once.permissions).toEqual([Permission.AuditRead]);
    expect(toggled(once, Permission.AuditRead).permissions).toEqual([]);
    expect(EMPTY_ROLE.permissions).toEqual([]);
  });
});

describe("a role's line", () => {
  it('says what the role lets someone do, leaving out "see" where it may also change it', () => {
    expect(
      roleLine(['products:read', 'products:manage', 'inventory:read', 'inventory:manage'], t),
    ).toBe('pmProductsManage · pmStockManage');
    expect(roleLine(['inventory:read', 'audit:read'], t)).toBe('pmStockRead · pmAudit');
  });

  it('keeps the editor’s order and ignores what the editor does not offer', () => {
    expect(roleLine(['settings:manage', 'orders:read', 'keys:manage'], t)).toBe(
      'pmKeys · pmSettings',
    );
    expect(roleLine([], t)).toBe('');
  });
});

describe('the people', () => {
  it('puts the owner first, then the active, then the inactive', () => {
    const people = sortPeople([
      memberOf({ id: 'off', active: false }),
      memberOf({ id: 'on' }),
      memberOf({ id: 'owner', isOwner: true }),
    ]);
    expect(people.map((each) => each.id)).toEqual(['owner', 'on', 'off']);
  });

  it('names a person by their name, else their phone as the sketch writes it', () => {
    expect(personLabel(memberOf({}))).toBe('Kamal');
    expect(personLabel(memberOf({ name: null }))).toBe('01611 222 333');
  });
});

describe('the seats', () => {
  it('are full when every one is in use; unlimited never fills', () => {
    expect(seatsFull({ used: 2, total: 2 })).toBe(true);
    expect(seatsFull({ used: 1, total: 2 })).toBe(false);
    expect(seatsFull({ used: 9, total: null })).toBe(false);
    expect(seatsFull(undefined)).toBe(false);
  });

  it('find the seat add-on and the plan in the shop’s suggestions, in either order', () => {
    expect(seatWays(usageWith({ first: SEAT, alternative: GROWTH }))).toEqual({
      seat: { key: 'extra_seat', monthly: 49 },
      plan: { planId: 'growth', name: 'Growth' },
    });
    expect(seatWays(usageWith({ first: GROWTH, alternative: null }))).toEqual({
      seat: null,
      plan: { planId: 'growth', name: 'Growth' },
    });
    expect(seatWays(usageWith(null))).toEqual({ seat: null, plan: null });
    expect(seatWays(undefined)).toEqual({ seat: null, plan: null });
  });

  it('price one seat even when the suggestion holds several', () => {
    const two: Suggestion = {
      kind: 'addons',
      items: [{ ...ONE_SEAT, quantity: 2, monthly: 98 }],
      monthly: 98,
    };
    expect(seatWays(usageWith({ first: two, alternative: null })).seat?.monthly).toBe(49);
  });

  it('say what is in use and the ways out the shop has, or the one a non-payer can take', () => {
    const both = {
      seat: { key: 'extra_seat', monthly: 49 },
      plan: { planId: 'growth', name: 'Growth' },
    };
    const seats = { used: 2, total: 2 };
    expect(seatFullText({ kind: 'add' }, seats, both, true, t)).toBe(
      'stAddFullLead {"total":2} stAddWaysBoth {"price":"৳49","plan":"Growth"}',
    );
    expect(seatFullText({ kind: 'add' }, seats, { ...both, plan: null }, true, t)).toContain(
      'stAddWaysSeat',
    );
    expect(seatFullText({ kind: 'add' }, seats, { ...both, seat: null }, true, t)).toContain(
      'stAddWaysPlan',
    );
    expect(seatFullText({ kind: 'add' }, seats, { seat: null, plan: null }, true, t)).toContain(
      'stAddWaysNone',
    );
    expect(seatFullText({ kind: 'reactivate', name: 'Sabrina' }, seats, both, true, t)).toBe(
      'stReactFullLead {"name":"Sabrina","used":2,"total":2} stWaysBoth {"price":"৳49","plan":"Growth"}',
    );
    expect(seatFullText({ kind: 'add' }, seats, both, false, t)).toBe(
      'stAddFullLead {"total":2} stWaysNoPay',
    );
  });

  it('turn a refusal for want of a seat into the dialog, and nothing else', () => {
    const refusal = (code: 'plan_limit_reached' | 'conflict') =>
      new ApiClientError(code, 'No seat', {}, 402);
    expect(refusedForSeat(refusal('plan_limit_reached'))).toBe(true);
    expect(refusedForSeat(refusal('conflict'))).toBe(false);
    expect(refusedForSeat(new Error('offline'))).toBe(false);
  });
});

describe('a first password', () => {
  it('is two groups of four from letters and digits that cannot be taken for one another', () => {
    expect(PASSWORD_LETTERS).not.toMatch(/[0o1li]/);
    const password = new FirstPassword().suggest();
    expect(password).toMatch(/^[a-hjkmnp-z2-9]{4}-[a-hjkmnp-z2-9]{4}$/);
  });

  it('takes each character from the random source', () => {
    const sequence = [9, 28, 10, 25, 12, 30, 13, 20];
    let next = 0;
    expect(new FirstPassword(() => sequence[next++] ?? 0).suggest()).toBe('k7m4-p9qx');
  });
});
