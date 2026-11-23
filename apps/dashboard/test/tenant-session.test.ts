import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TenantSession } from '../src/session/tenant-session';

// SEC-14 as decided 2026-11-23: one CSRF token shared by every tab and the installed app, as the session cookie is.

const KEY = 'lytro.tenant.csrf';

/** What the browser tells this tab when another tab changes the shared token. */
function anotherTab(newValue: string | null): void {
  window.dispatchEvent(
    new StorageEvent('storage', { key: KEY, newValue, storageArea: localStorage }),
  );
}

/** The token the dashboard's next change carries. */
async function tokenSentBy(session: TenantSession): Promise<string | null> {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ success: true, statusCode: 200, message: 'ok', data: {} }), {
      status: 200,
    }),
  );
  vi.stubGlobal('fetch', fetchMock);
  await session.client.post('/anything', {});
  const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
  return new Headers(init.headers).get('x-csrf-token');
}

describe('the seller session across tabs', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is signed in on a second tab, or a link opened from an SMS, without signing in again', () => {
    new TenantSession().setSignedIn('csrf-1');
    expect(new TenantSession().isSignedIn()).toBe(true);
  });

  it('keeps a tab signed in across the deploy that moved the token out of sessionStorage', () => {
    sessionStorage.setItem(KEY, 'csrf-old');
    expect(new TenantSession().isSignedIn()).toBe(true);
    expect(localStorage.getItem(KEY)).toBe('csrf-old');
  });

  it('sends the newest token after another tab signs in, never the stale one', async () => {
    const session = new TenantSession();
    session.setSignedIn('csrf-1');
    anotherTab('csrf-2');
    expect(await tokenSentBy(session)).toBe('csrf-2');
  });

  it('goes to sign-in when another tab signs out, forgetting who was signed in', () => {
    const signedOut = vi.fn();
    const session = new TenantSession();
    session.whenSignedOutElsewhere(signedOut);
    session.setSignedIn('csrf-1', { id: 'u1' } as never);
    anotherTab(null);
    expect(session.isSignedIn()).toBe(false);
    expect(session.getMe()).toBeNull();
    expect(signedOut).toHaveBeenCalledTimes(1);
  });

  it('signing out clears the shared token, so every other tab follows', () => {
    const session = new TenantSession();
    session.setSignedIn('csrf-1');
    session.clear();
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(new TenantSession().isSignedIn()).toBe(false);
  });
});
