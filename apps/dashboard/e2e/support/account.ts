// Account as the server answers it (AUTH-20, AUTH-26, AUTH-27, STF-13): the person's ways to sign in and the writes the
// page makes, kept so a read after shows what changed. A code of 000000 and a current password of "wrong" are refused,
// as the server refuses them; removing the last way in is refused with `conflict`.

export interface IdentityFixture {
  id: string;
  kind: 'phone' | 'email' | 'google' | 'facebook';
  value: string;
}

/** The working shop's owner: a phone, and an email where a test says the account has one. */
export function ownIdentities(hasEmail: boolean): IdentityFixture[] {
  return [
    { id: 'i-1', kind: 'phone', value: '+8801711234567' },
    ...(hasEmail ? [{ id: 'i-2', kind: 'email' as const, value: 'rumana@example.com' }] : []),
  ];
}

/** The prototype's `account`: the phone and Google; Facebook not connected; no email. */
export function drawnIdentities(): IdentityFixture[] {
  return [
    { id: 'i-1', kind: 'phone', value: '+8801711234567' },
    { id: 'i-3', kind: 'google', value: 'rumana@gmail.com' },
  ];
}

/** Where a connect sends the browser instead of the provider. */
export const OAUTH_PAGE = '/__oauth/';

export interface Refusal {
  status: number;
  code: string;
  message: string;
  details: Record<string, unknown>;
}

const refused = (status: number, code: string, message: string): { refused: Refusal } => ({
  refused: { status, code, message, details: {} },
});

/** A write of Account, kept in the fixture: its answer, a refusal, or undefined when the path is not Account's. */
export function accountWrite(
  method: string,
  path: string,
  body: Record<string, unknown> | null,
  identities: IdentityFixture[],
): { data: unknown } | { refused: Refusal } | undefined {
  // AUTH-27: the provider's page is a same-origin stand-in; its callback answers that the provider was connected.
  const starting = /^\/me\/identities\/oauth\/([^/]+)\/start$/.exec(path);
  if (method === 'POST' && starting) return { data: { url: `${OAUTH_PAGE}${starting[1] ?? ''}` } };
  const returning = /^\/auth\/oauth\/([^/]+)\/callback$/.exec(path);
  if (method === 'GET' && returning) return { data: { attached: returning[1] } };
  if (method === 'POST' && path === '/me/identities/code') {
    return { data: { expiresInSeconds: 600, resendAfterSeconds: 42 } };
  }
  if (method === 'POST' && path === '/me/identities/verify') {
    if (body?.code === '000000') return refused(400, 'validation_error', 'That code is not right.');
    identities.push({
      id: `i-${String(identities.length + 10)}`,
      kind: 'email',
      value: typeof body?.value === 'string' ? body.value : '',
    });
    return { data: { attached: true } };
  }
  const removing = /^\/me\/identities\/([^/]+)$/.exec(path);
  if (method === 'DELETE' && removing) {
    if (identities.length <= 1) return refused(409, 'conflict', 'This is the only way in.');
    const index = identities.findIndex((each) => each.id === removing[1]);
    if (index >= 0) identities.splice(index, 1);
    return { data: { ok: true } };
  }
  if (method === 'POST' && (path === '/auth/password' || path === '/auth/staff/password')) {
    if (body?.currentPassword === 'wrong') {
      return refused(400, 'validation_error', 'The current password is not right.');
    }
    return { data: { ok: true } };
  }
  return undefined;
}
