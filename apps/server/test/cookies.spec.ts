import { describe, expect, it } from 'vitest';
import { originAllowed, sessionCookieName } from '../src/common/cookies';

// TEN-29: host-only session cookies and the Origin check on state-changing requests.
describe('session cookie names (TEN-29)', () => {
  it('carries the __Host- prefix wherever cookies are Secure, and the bare name in plain-HTTP development', () => {
    expect(sessionCookieName('lytronix_session', true)).toBe('__Host-lytronix_session');
    expect(sessionCookieName('lytronix_session', false)).toBe('lytronix_session');
  });
});

describe('the Origin check (TEN-29)', () => {
  const dashboard = 'https://app.lytro.app';

  it("accepts only the app's own origin", () => {
    expect(originAllowed('https://app.lytro.app', dashboard)).toBe(true);
    expect(originAllowed('https://megh.lytro.app', dashboard)).toBe(false);
    expect(originAllowed('https://admin.lytro.app', dashboard)).toBe(false);
    expect(originAllowed('http://app.lytro.app', dashboard)).toBe(false);
  });

  it('lets a request with no Origin through to the CSRF check, and checks nothing when no origin is set', () => {
    expect(originAllowed(undefined, dashboard)).toBe(true);
    expect(originAllowed('https://anything.example', null)).toBe(true);
  });
});
