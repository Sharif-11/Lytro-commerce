import { beforeEach, describe, expect, it } from 'vitest';
import { OperatorSession } from '../src/session/operator-session';

describe('OperatorSession', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('starts signed out without a stored token', () => {
    expect(new OperatorSession().isSignedIn()).toBe(false);
  });

  it('remembers the token for a reload and forgets it on clear', () => {
    const session = new OperatorSession();
    session.setSignedIn('csrf-1');
    expect(session.isSignedIn()).toBe(true);
    expect(new OperatorSession().isSignedIn()).toBe(true);
    session.clear();
    expect(session.isSignedIn()).toBe(false);
    expect(new OperatorSession().isSignedIn()).toBe(false);
  });

  it('keeps its token apart from the seller dashboard key', () => {
    sessionStorage.setItem('lytro.tenant.csrf', 'seller');
    expect(new OperatorSession().isSignedIn()).toBe(false);
  });
});
