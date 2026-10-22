import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { expect } from 'vitest';
import {
  cookieFrom,
  deleteJson,
  getJson,
  patchJson,
  postJson,
  putJson,
  type HttpResult,
} from './http';
import type { SmsCapture } from './sms-capture';

/** A signed-in owner of one shop, calling the dashboard API the way apps/dashboard does (TEN-31). */
export class ShopClient {
  constructor(
    private readonly port: number,
    readonly slug: string,
    readonly tenantId: string,
    private readonly cookie: string,
    private readonly csrfToken: string,
  ) {}

  headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      cookie: this.cookie,
      'x-csrf-token': this.csrfToken,
      host: 'localhost',
      'x-lytro-shop': this.slug,
      ...extra,
    };
  }

  get(path: string): Promise<HttpResult> {
    return getJson(this.port, path, this.headers());
  }

  post(path: string, body: unknown): Promise<HttpResult> {
    return postJson(this.port, path, body, this.headers());
  }

  patch(path: string, body: unknown): Promise<HttpResult> {
    return patchJson(this.port, path, body, this.headers());
  }

  put(path: string, body: unknown): Promise<HttpResult> {
    return putJson(this.port, path, body, this.headers());
  }

  delete(path: string): Promise<HttpResult> {
    return deleteJson(this.port, path, this.headers());
  }
}

/** Signs a new owner up by phone code and opens a trial shop, as AUTH-28's first steps do. */
export async function openShop(
  port: number,
  texts: SmsCapture,
  prefix = 'shop',
): Promise<ShopClient> {
  const phone = texts.freshPhone();
  const slug = `${prefix}-${randomUUID().replace(/-/g, '').slice(0, 10)}`;
  await postJson(port, '/auth/phone/code', { phone }, { host: 'localhost' });
  const entered = await postJson(
    port,
    '/auth/phone/verify',
    { phone, code: texts.codeFor(phone) },
    { host: 'localhost' },
  );
  const cookie = cookieFrom(entered);
  const csrfToken = (entered.body as { csrfToken: string }).csrfToken;
  const shop = await postJson(
    port,
    '/shops',
    { ownerName: 'Owner', shopName: `Shop ${slug}`, address: slug },
    { cookie, 'x-csrf-token': csrfToken, host: 'localhost' },
  );
  expect(shop.status).toBe(201);
  const me = await getJson(port, '/me', { cookie, host: 'localhost', 'x-lytro-shop': slug });
  const tenantId = (me.body as { tenant: { id: string } }).tenant.id;
  return new ShopClient(port, slug, tenantId, cookie, csrfToken);
}

/** The error part of a refusal, as the test helpers unwrap it. */
export function errorOf(result: HttpResult): {
  code: string;
  message: string;
  details: Record<string, unknown>;
} {
  return (
    result.body as { error: { code: string; message: string; details: Record<string, unknown> } }
  ).error;
}

/** The fields a refusal names, by path. */
export function fieldsOf(result: HttpResult): Record<string, string> {
  const fields = errorOf(result).details['fields'];
  if (!Array.isArray(fields)) return {};
  return Object.fromEntries(
    (fields as { field: string; problem: string }[]).map((entry) => [entry.field, entry.problem]),
  );
}

const STAFF_PASSWORD = 'staff-pass-2468';

/**
 * AUTH-31: a staff member's first sign-in must choose their own password before any other route opens. A helper that
 * signs staff in to call routes as them passes that step, choosing the same password (a forced change allows it).
 */
export async function passFirstSignIn(
  port: number,
  signedIn: HttpResult,
  password: string,
  headers: Record<string, string>,
): Promise<void> {
  if ((signedIn.body as { next?: string }).next !== 'set-password') return;
  const chosen = await postJson(
    port,
    '/auth/staff/password',
    { newPassword: password },
    {
      cookie: cookieFrom(signedIn),
      'x-csrf-token': (signedIn.body as { csrfToken: string }).csrfToken,
      ...headers,
    },
  );
  expect(chosen.status, JSON.stringify(chosen.body)).toBe(200);
}

/**
 * INV-20, D3-9: a staff member of the shop holding only these permissions, signed in; the headers to call as them. The
 * shop moves to the Starter plan first, so it has a seat for them.
 */
export async function staffWith(
  port: number,
  texts: SmsCapture,
  admin: pg.Client,
  shop: ShopClient,
  permissions: string[],
): Promise<Record<string, string>> {
  await admin.query(
    "UPDATE control.tenants SET plan_id = (SELECT id FROM control.plans WHERE name = 'Starter'), plan_snapshot = (SELECT limits FROM control.plans WHERE name = 'Starter') WHERE id = $1",
    [shop.tenantId],
  );
  const role = (await shop.post('/roles', { name: permissions.join(' '), permissions })).body as {
    id: string;
  };
  const phone = texts.freshPhone();
  const made = await shop.post('/staff', { phone, password: STAFF_PASSWORD, roleIds: [role.id] });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  const signedIn = await postJson(
    port,
    '/auth/staff/signin',
    { phone, password: STAFF_PASSWORD },
    { host: 'localhost', 'x-lytro-shop': shop.slug },
  );
  await passFirstSignIn(port, signedIn, STAFF_PASSWORD, {
    host: 'localhost',
    'x-lytro-shop': shop.slug,
  });
  return {
    cookie: cookieFrom(signedIn),
    'x-csrf-token': (signedIn.body as { csrfToken: string }).csrfToken,
    host: 'localhost',
    'x-lytro-shop': shop.slug,
  };
}
