import { randomUUID } from 'node:crypto';
import { codeFor } from './sms-log';
import { PROXY_PORT } from './ports';

/** A fresh Bangladeshi-shaped phone number, distinct across tests, matching apps/server's own test helper. */
export function freshPhone(): string {
  return `0171${randomUUID().replace(/\D/g, '').slice(0, 7)}`;
}

interface Session {
  cookie: string;
  csrfToken: string;
}

function baseUrl(host: string): string {
  return `http://${host}:${String(PROXY_PORT)}`;
}

/** Signs a brand-new phone up through the real API (code request, verify, create-shop) — the fastest way
    for a test to get into a signed-in dashboard without driving every onboarding screen through the UI
    first. `host` is the tenant host the test will later open in the browser (platform host for sign-up). */
export async function signUpShop(
  platformHost: string,
  smsLogFile: string,
  shopName: string,
): Promise<{ phone: string; slug: string } & Session> {
  const phone = freshPhone();
  await fetch(`${baseUrl(platformHost)}/api/auth/phone/code`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone }),
  });
  const code = await codeFor(smsLogFile, phone);
  const verified = await fetch(`${baseUrl(platformHost)}/api/auth/phone/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone, code }),
  });
  const cookie = (verified.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
  const verifiedBody = (await verified.json()) as { next: string; csrfToken: string };
  if (verifiedBody.next !== 'create-shop') {
    throw new Error(`expected create-shop, got ${verifiedBody.next}`);
  }
  const session: Session = { cookie, csrfToken: verifiedBody.csrfToken };

  const created = await fetch(`${baseUrl(platformHost)}/api/shops`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: session.cookie,
      'x-csrf-token': session.csrfToken,
    },
    body: JSON.stringify({ ownerName: 'Owner', shopName }),
  });
  if (created.status !== 201) {
    throw new Error(`create-shop failed: ${String(created.status)} ${await created.text()}`);
  }
  const body = (await created.json()) as { address: string };

  const setPassword = await fetch(`${baseUrl(platformHost)}/api/auth/password`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: session.cookie,
      'x-csrf-token': session.csrfToken,
    },
    body: JSON.stringify({ newPassword: E2E_PASSWORD }),
  });
  if (setPassword.status !== 200) {
    throw new Error(`set-password failed: ${String(setPassword.status)}`);
  }

  return { phone, slug: body.address, ...session };
}

/** Every E2E-created owner gets this password, so UI sign-in tests don't need a fresh one per fixture. */
export const E2E_PASSWORD = 'correct-horse-9';
