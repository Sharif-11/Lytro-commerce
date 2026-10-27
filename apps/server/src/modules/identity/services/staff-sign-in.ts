import type { SessionRecord } from '../ports/session-store';

/**
 * AUTH-31, TEN-31: a staff sign-in, made on the staff page with the password the shop's owner set (STF-01, STF-13),
 * carries its staff row from the moment it opens; the person's own sign-in (code, password, Google, Facebook) carries
 * none until a shop page narrows it.
 */
export function isStaffSignIn(session: Pick<SessionRecord, 'userId'>): boolean {
  return session.userId !== null;
}
