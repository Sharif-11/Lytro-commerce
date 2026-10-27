import type { Page } from '@playwright/test';
import { PASSWORD_LETTERS } from '../../src/lib/first-password';
import type { Language } from './mock-api';

// The Team section as the server answers it (STF-01 to STF-13): the prototype's three people and two roles, and the
// writes the screens make, each kept so the list read after it shows what changed.

export interface MemberFixture {
  id: string;
  phone: string | null;
  name: string | null;
  isOwner: boolean;
  active: boolean;
  mustSetPassword: boolean;
  roleIds: string[];
}

export interface RoleFixture {
  id: string;
  name: string;
  permissions: string[];
}

export interface TeamFixture {
  staff: MemberFixture[];
  roles: RoleFixture[];
  /** The plan's seats, the owner's among them; null is unlimited. */
  seats: number | null;
}

export const STOCK_PERMISSIONS = [
  'products:read',
  'products:manage',
  'inventory:read',
  'inventory:manage',
];
export const BILLING_PERMISSIONS = [
  'balance:read',
  'balance:manage',
  'payments:read',
  'payments:manage',
  'audit:read',
];

/** The prototype's `team` and `roles`: Rumana owns the shop; Kamal holds Billing staff and has no password of his own
 *  yet; Sabrina, on Stock staff, is inactive. Two seats, both in use. */
export function drawnTeam(language: Language): TeamFixture {
  const bn = language === 'bn';
  return {
    seats: 2,
    roles: [
      { id: 'r-stock', name: bn ? 'স্টক স্টাফ' : 'Stock staff', permissions: STOCK_PERMISSIONS },
      {
        id: 'r-billing',
        name: bn ? 'বিলিং স্টাফ' : 'Billing staff',
        permissions: BILLING_PERMISSIONS,
      },
    ],
    staff: [
      {
        id: 'u-owner',
        phone: '+8801711234567',
        name: bn ? 'রুমানা' : 'Rumana',
        isOwner: true,
        active: true,
        mustSetPassword: false,
        roleIds: [],
      },
      {
        id: 'u-kamal',
        phone: '+8801611222333',
        name: bn ? 'কামাল হোসেন' : 'Kamal Hossain',
        isOwner: false,
        active: true,
        mustSetPassword: true,
        roleIds: ['r-billing'],
      },
      {
        id: 'u-sabrina',
        phone: '+8801911444555',
        name: bn ? 'সাবরিনা' : 'Sabrina',
        isOwner: false,
        active: false,
        mustSetPassword: false,
        roleIds: ['r-stock'],
      },
    ],
  };
}

/**
 * Makes the next first passwords the given ones (the prototype draws `k7m4-p9qx` for Add staff and `h3vd-8wqs` for a
 * reset), by answering the browser's random source with their letters in turn.
 */
export async function drawnPasswords(page: Page, passwords: readonly string[]): Promise<void> {
  const values = passwords.flatMap((each) =>
    each
      .replace('-', '')
      .split('')
      .map((letter) => PASSWORD_LETTERS.indexOf(letter)),
  );
  await page.addInitScript((sequence: number[]) => {
    let next = 0;
    const real = crypto.getRandomValues.bind(crypto);
    Object.defineProperty(crypto, 'getRandomValues', {
      value: (array: Uint32Array) => {
        if (array.length !== 1) return real(array);
        array[0] = sequence[next % sequence.length] ?? 0;
        next += 1;
        return array;
      },
    });
  }, values);
}

const CREATED_AT = '2026-10-01T04:00:00.000Z';

function seatsOf(team: TeamFixture): { used: number; total: number | null } {
  return { used: team.staff.filter((each) => each.active).length, total: team.seats };
}

function full(team: TeamFixture): boolean {
  const seats = seatsOf(team);
  return seats.total !== null && seats.used >= seats.total;
}

/** GET /staff and GET /roles, else undefined. */
export function teamAnswer(path: string, team: TeamFixture): unknown {
  if (path === '/staff') {
    return {
      seats: seatsOf(team),
      staff: team.staff.map((each) => ({ ...each, createdAt: CREATED_AT })),
    };
  }
  if (path === '/roles') {
    return team.roles.map((role) => ({
      ...role,
      holders: team.staff.filter((each) => each.roleIds.includes(role.id)).length,
    }));
  }
  return undefined;
}

/** What a refusal sends, by its code. */
export interface TeamRefusal {
  status: number;
  code: string;
  message: string;
  details: Record<string, unknown>;
}

const NO_SEAT = (team: TeamFixture): TeamRefusal => ({
  status: 402,
  code: 'plan_limit_reached',
  message: 'Every seat is in use.',
  details: { metric: 'seats', seats: team.seats },
});

/** A Team write, kept in the fixture: its answer, a refusal, or undefined when the path is not Team's. */
export function teamWrite(
  method: string,
  path: string,
  body: Record<string, unknown> | null,
  team: TeamFixture,
): { data: unknown } | { refused: TeamRefusal } | undefined {
  if (method === 'POST' && path === '/staff') {
    if (full(team)) return { refused: NO_SEAT(team) };
    const member: MemberFixture = {
      id: `u-${String(team.staff.length + 1)}`,
      phone: typeof body?.phone === 'string' ? body.phone : '',
      name: typeof body?.name === 'string' ? body.name : null,
      isOwner: false,
      active: true,
      mustSetPassword: true,
      roleIds: (body?.roleIds as string[] | undefined) ?? [],
    };
    team.staff.push(member);
    return { data: { ...member, createdAt: CREATED_AT } };
  }
  const staff = /^\/staff\/([^/]+)$/.exec(path);
  if (method === 'PATCH' && staff) {
    const member = team.staff.find((each) => each.id === staff[1]);
    if (!member) return undefined;
    if (body?.active === true && !member.active && full(team)) return { refused: NO_SEAT(team) };
    if (typeof body?.active === 'boolean') member.active = body.active;
    if (body && 'name' in body) member.name = typeof body.name === 'string' ? body.name : null;
    if (Array.isArray(body?.roleIds)) member.roleIds = body.roleIds as string[];
    return { data: { ...member, createdAt: CREATED_AT } };
  }
  const password = /^\/staff\/([^/]+)\/password$/.exec(path);
  if (method === 'POST' && password) {
    const member = team.staff.find((each) => each.id === password[1]);
    if (member) member.mustSetPassword = true;
    return { data: { ok: true } };
  }
  if (method === 'POST' && path === '/roles') {
    const role: RoleFixture = {
      id: `r-${String(team.roles.length + 1)}`,
      name: typeof body?.name === 'string' ? body.name : '',
      permissions: (body?.permissions as string[] | undefined) ?? [],
    };
    team.roles.push(role);
    return { data: { ...role, holders: 0 } };
  }
  const role = /^\/roles\/([^/]+)$/.exec(path);
  if (role && (method === 'PATCH' || method === 'DELETE')) {
    const found = team.roles.find((each) => each.id === role[1]);
    if (!found) return undefined;
    const holders = team.staff.filter((each) => each.roleIds.includes(found.id)).length;
    if (method === 'DELETE') {
      if (holders > 0) {
        return {
          refused: {
            status: 409,
            code: 'conflict',
            message: 'People hold this role.',
            details: { holders },
          },
        };
      }
      team.roles = team.roles.filter((each) => each !== found);
      return { data: { ok: true } };
    }
    if (typeof body?.name === 'string') found.name = body.name;
    if (Array.isArray(body?.permissions)) found.permissions = body.permissions as string[];
    return { data: { ...found, holders } };
  }
  return undefined;
}
