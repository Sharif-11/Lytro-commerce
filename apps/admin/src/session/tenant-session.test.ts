import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TenantSession } from './tenant-session';

describe('TenantSession', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    sessionStorage.clear();
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('clears the session when the boot-time /me check fails and nothing signed in meanwhile', async () => {
    fetchMock.mockRejectedValue(new Error('network error'));

    const session = new TenantSession();
    await session.init();

    expect(session.isSignedIn()).toBe(false);
  });

  it("does not clobber a session established while init()'s /me call is still in flight", async () => {
    // Reproduces the OAuth callback race: main.tsx's boot-time init() and the callback's own setSignedIn()
    // both fire on the same fresh page load (Google's redirect is a real navigation). init()'s /me call
    // always 401s at that point (no session exists yet) — it must not undo a sign-in that completed while
    // it was still pending.
    let rejectMeCall!: (error: unknown) => void;
    fetchMock.mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectMeCall = reject;
      }),
    );

    const session = new TenantSession();
    const initPromise = session.init();

    session.setSignedIn('fresh-csrf-token');
    rejectMeCall(new Error('network error'));
    await initPromise;

    expect(session.isSignedIn()).toBe(true);
  });
});
