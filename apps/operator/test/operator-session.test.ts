import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OperatorSession } from '../src/session/operator-session';

const KEY = 'lytro.operator.csrf';

/** What the browser tells this tab when another tab changes the shared token. */
function anotherTab(newValue: string | null): void {
  window.dispatchEvent(
    new StorageEvent('storage', { key: KEY, newValue, storageArea: localStorage }),
  );
}

/** The token the console's next change carries. */
async function tokenSentBy(session: OperatorSession): Promise<string | null> {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ success: true, statusCode: 200, message: 'ok', data: {} }), {
      status: 200,
    }),
  );
  vi.stubGlobal('fetch', fetchMock);
  await session.client.post('/operator/anything', {});
  const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
  return new Headers(init.headers).get('x-csrf-token');
}

describe('OperatorSession', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('starts signed out without a stored token', () => {
    expect(new OperatorSession().isSignedIn()).toBe(false);
  });

  it('remembers the token for a reload and a second tab, and forgets it on clear', () => {
    const session = new OperatorSession();
    session.setSignedIn('csrf-1');
    expect(session.isSignedIn()).toBe(true);
    expect(localStorage.getItem(KEY)).toBe('csrf-1');
    expect(new OperatorSession().isSignedIn()).toBe(true);
    session.clear();
    expect(session.isSignedIn()).toBe(false);
    expect(new OperatorSession().isSignedIn()).toBe(false);
  });

  it('keeps a tab signed in across the deploy that moved the token out of sessionStorage', () => {
    sessionStorage.setItem(KEY, 'csrf-old');
    expect(new OperatorSession().isSignedIn()).toBe(true);
    expect(localStorage.getItem(KEY)).toBe('csrf-old');
  });

  it('sends the newest token after another tab signs in, never the stale one', async () => {
    const session = new OperatorSession();
    session.setSignedIn('csrf-1');
    anotherTab('csrf-2');
    expect(await tokenSentBy(session)).toBe('csrf-2');
  });

  it('goes to sign-in when another tab signs out', () => {
    const signedOut = vi.fn();
    const session = new OperatorSession();
    session.whenSignedOutElsewhere(signedOut);
    session.setSignedIn('csrf-1');
    anotherTab(null);
    expect(session.isSignedIn()).toBe(false);
    expect(signedOut).toHaveBeenCalledTimes(1);
  });

  it('stays where it is when another tab signs out and this one was signed out already', () => {
    const signedOut = vi.fn();
    new OperatorSession().whenSignedOutElsewhere(signedOut);
    anotherTab(null);
    expect(signedOut).not.toHaveBeenCalled();
  });

  it('keeps its token apart from the seller dashboard key', () => {
    localStorage.setItem('lytro.tenant.csrf', 'seller');
    expect(new OperatorSession().isSignedIn()).toBe(false);
  });
});
