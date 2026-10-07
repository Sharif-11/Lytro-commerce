import { Inject, Injectable } from '@nestjs/common';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { AuditAction, AuditResult, type SignInMethod } from '@lytronix/validators';
import type { Transaction } from '@lytronix/db';
import { DAY_MS } from '../../../common/time';
import { SESSION_SETTINGS, SESSION_STORE, SIGNUP_SETTINGS } from '../tokens';
import { SignInAudit } from './sign-in-audit';
import type { SessionRecord, SessionStore } from '../ports/session-store';
import type { SignupSettings } from '../ports/signup-settings';
import type { OpenedSession, SessionContext, SessionSettings } from '../types/session';

// D1, SEC-07, SEC-14: server-side sessions. The cookie carries a random token; only its SHA-256 is stored.
export const SESSION_COOKIE = 'lytronix_session';
export const SESSION_TTL_MS = 7 * DAY_MS;

@Injectable()
export class SessionService {
  constructor(
    @Inject(SESSION_STORE) private readonly store: SessionStore,
    @Inject(SIGNUP_SETTINGS) private readonly clock: SignupSettings,
    @Inject(SESSION_SETTINGS) private readonly settings: SessionSettings,
    @Inject(SignInAudit) private readonly signInAudit: SignInAudit,
  ) {}

  /** Creates a session in the caller's unit of work and returns the cookie value and CSRF token to send back. */
  async open(
    tx: Transaction,
    values: {
      subscriberId: string;
      tenantId: string | null;
      // The staff user this session belongs to, for a session opened on a shop host by staff (null for the owner).
      userId?: string | null;
      mustSetPassword: boolean;
      signInMethod: SignInMethod;
      context: SessionContext;
    },
  ): Promise<OpenedSession> {
    const token = randomBytes(32).toString('base64url');
    const csrfToken = randomBytes(32).toString('base64url');
    await this.store.insert(tx, {
      tokenHash: this.digest(token),
      csrfHash: this.digest(csrfToken),
      subscriberId: values.subscriberId,
      tenantId: values.tenantId,
      userId: values.userId ?? null,
      mustSetPassword: values.mustSetPassword,
      signInMethod: values.signInMethod,
      expiresAt: new Date(this.clock.now().getTime() + SESSION_TTL_MS),
      userAgent: values.context.userAgent,
      ip: values.context.ip,
    });
    return { cookie: this.cookieFor(token), csrfToken };
  }

  /** The live session named by the request's cookie, or null. Expired and revoked sessions do not resolve. */
  async resolve(cookieHeader: string | undefined): Promise<SessionRecord | null> {
    const token = this.readToken(cookieHeader);
    if (token === null) return null;
    return this.store.findActive(this.digest(token), this.clock.now());
  }

  async revoke(session: SessionRecord): Promise<void> {
    await this.store.revoke(session.id, this.clock.now());
    await this.signInAudit.log(
      session.tenantId,
      session.userId,
      AuditAction.SignOut,
      AuditResult.Success,
    );
  }

  attachTenant(tx: Transaction, sessionId: string, tenantId: string): Promise<void> {
    return this.store.attachTenant(tx, sessionId, tenantId);
  }

  /** After a password is set: the session may use the dashboard, and every other session ends (AUTH-20). */
  /** Clears the forced-change block on one session only. A staff member's other sessions are not touched. */
  clearMustSetPassword(tx: Transaction, session: SessionRecord): Promise<void> {
    return this.store.clearMustSetPassword(tx, session.id);
  }

  async completePasswordChange(tx: Transaction, session: SessionRecord): Promise<void> {
    const now = this.clock.now();
    await this.store.clearMustSetPassword(tx, session.id);
    await this.store.revokeOthers(tx, session.subscriberId, session.id, now);
  }

  /** True when the header value is the CSRF token the session was issued with (SEC-14). Compared in constant time. */
  csrfMatches(session: SessionRecord, received: string | undefined): boolean {
    if (received === undefined) return false;
    const a = Buffer.from(this.digest(received));
    const b = Buffer.from(session.csrfHash);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  clearCookie(): string {
    return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${this.secureSuffix()}`;
  }

  private cookieFor(token: string): string {
    const maxAge = Math.floor(SESSION_TTL_MS / 1000);
    return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${String(maxAge)}${this.secureSuffix()}`;
  }

  private secureSuffix(): string {
    return this.settings.secureCookies ? '; Secure' : '';
  }

  private readToken(cookieHeader: string | undefined): string | null {
    if (!cookieHeader) return null;
    for (const part of cookieHeader.split(';')) {
      const [name, ...rest] = part.trim().split('=');
      if (name === SESSION_COOKIE && rest.length > 0) return rest.join('=');
    }
    return null;
  }

  private digest(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }
}
