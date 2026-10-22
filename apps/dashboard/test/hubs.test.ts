import { describe, expect, it } from 'vitest';
import { Permission } from '@lytronix/validators';
import { daysSince } from '../src/lib/dates';
import {
  hasPlusActions,
  hubOf,
  visibleHubs,
  visibleSections,
  type Viewer,
} from '../src/shell/hubs';

const OWNER: Viewer = { isOwner: true, permissions: [] };

function staff(...permissions: Permission[]): Viewer {
  return { isOwner: false, permissions };
}

// TENANT-DASHBOARD-DESIGN §3, STF-11: what the navigation shows each person.
describe('the hubs a person sees', () => {
  it('shows the owner every hub, each going to its first section (Menu to its own page)', () => {
    expect(visibleHubs(OWNER).map(({ hub, to }) => [hub.id, to])).toEqual([
      ['home', '/$shop'],
      ['orders', '/$shop/orders'],
      ['shop', '/$shop/products'],
      ['money', '/$shop/balance'],
      ['menu', '/$shop/menu'],
    ]);
  });

  it('hides a hub whose every section is hidden, and opens a hub on the first section a person may open', () => {
    const counter = staff(Permission.InventoryRead, Permission.PaymentsRead);
    expect(visibleHubs(counter).map(({ hub, to }) => [hub.id, to])).toEqual([
      ['home', '/$shop'],
      ['shop', '/$shop/stock'],
      ['money', '/$shop/plan'],
      ['menu', '/$shop/menu'],
    ]);
    expect(visibleSections(hubOf('shop'), counter).map((s) => s.id)).toEqual([
      'stock',
      'purchases',
    ]);
    // Everyone has their own account, so Menu never disappears.
    expect(visibleSections(hubOf('menu'), staff()).map((s) => s.id)).toEqual(['account']);
  });

  it('shows Settings to whoever manages the settings or the API keys', () => {
    expect(visibleSections(hubOf('menu'), staff(Permission.KeysManage)).map((s) => s.id)).toEqual([
      'settings',
      'account',
    ]);
  });

  it('offers the + menu only to someone who can start something from it (§4.5)', () => {
    expect(hasPlusActions(OWNER)).toBe(true);
    expect(hasPlusActions(staff(Permission.BalanceRead))).toBe(false);
    expect(hasPlusActions(staff(Permission.BalanceManage))).toBe(true);
  });
});

describe('days since (LIF-05)', () => {
  it('counts whole days since a moment that has passed, 0 on the day itself and before it', () => {
    const now = Date.parse('2026-10-23T12:00:00Z');
    expect(daysSince('2026-10-20T13:00:00Z', now)).toBe(2);
    expect(daysSince('2026-10-23T08:00:00Z', now)).toBe(0);
    expect(daysSince('2026-10-30T08:00:00Z', now)).toBe(0);
    expect(daysSince(null, now)).toBeNull();
  });
});
