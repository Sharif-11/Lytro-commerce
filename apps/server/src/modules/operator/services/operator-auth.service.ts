import { Inject, Injectable } from '@nestjs/common';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  AuditResult,
  PlatformActorType,
  PlatformAuditAction,
  ServerFieldProblemCode,
} from '@lytronix/validators';
import type { Transaction } from '@lytronix/db';
import { ApiError, FieldsError } from '../../../common/api-error';
import { originAllowed, sessionCookieName } from '../../../common/cookies';
import { HOUR_MS } from '../../../common/time';
import { SIGNIN_MAX_FAILURES, SIGNIN_WINDOW_MS } from '../../identity/services/sign-in-lockout';
import { PlatformAuditService } from '../../audit/services/platform-audit.service';
import { OPERATOR_GATEWAY, OPERATOR_SETTINGS } from '../tokens';
import type {
  OperatorAccountRecord,
  OperatorGateway,
  OperatorSessionRecord,
} from '../ports/operator-gateway';
import { PasswordHasher } from '../../identity/services/password-hasher';
import { TotpService } from './totp.service';
import type {
  OpenedOperatorSession,
  OperatorEnrolled,
  OperatorMe,
  OperatorSessionContext,
  OperatorSessionSettings,
  OperatorSigninResult,
} from '../types/session';

// ADM-01, ADM-18, D8: operator sign-in. Every step re-asserts email and password — there is no intermediate
// "pending enrollment" session to protect separately, so each request stands on its own.
export const OPERATOR_SESSION_COOKIE = 'lytronix_operator_session';
// Shorter than the tenant dashboard's 7 days (D1): this account can reach every tenant's data, so a shorter
// lived session is a deliberately tighter default here, not a figure the SRS specifies.
export const OPERATOR_SESSION_TTL_MS = 12 * HOUR_MS;
const BACKUP_CODE_COUNT = 10;
const TOTP_CODE_PATTERN = /^\d{6}$/;

@Injectable()
export class OperatorAuthService {
  constructor(
    @Inject(OPERATOR_GATEWAY) private readonly gateway: OperatorGateway,
    @Inject(PasswordHasher) private readonly passwords: PasswordHasher,
    @Inject(TotpService) private readonly totp: TotpService,
    @Inject(OPERATOR_SETTINGS) private readonly settings: OperatorSessionSettings,
    @Inject(PlatformAuditService) private readonly platformAudit: PlatformAuditService,
  ) {}

  /** Password only. Never opens a session — tells the caller whether to enroll or enter a code next. */
  async signin(
    email: string,
    password: string,
    ip: string | null = null,
  ): Promise<OperatorSigninResult> {
    const account = await this.authenticate(email, password, ip);
    if (account.twoFactorConfirmedAt !== null) {
      return { next: 'verify-2fa' };
    }
    let secret = account.twoFactorSecret;
    if (secret === null) {
      const fresh = this.totp.generateSecret();
      await this.gateway.run((tx) => this.gateway.setTwoFactorSecret(tx, account.id, fresh));
      secret = fresh;
    }
    return { next: 'enroll-2fa', secret, uri: this.totp.uriFor(secret, account.email) };
  }

  /** Confirms the first TOTP code against the freshly issued secret, then opens the session (ADM-01). */
  async enroll(
    email: string,
    password: string,
    code: string,
    context: OperatorSessionContext,
  ): Promise<OperatorEnrolled> {
    const account = await this.authenticate(email, password, context.ip);
    if (account.twoFactorConfirmedAt !== null) {
      throw new ApiError('conflict', 'TwoFactorAlreadyEnrolled', {});
    }
    if (account.twoFactorSecret === null) {
      throw new ApiError('validation_error', 'TwoFactorNeedsNewCode', {});
    }
    if (
      !TOTP_CODE_PATTERN.test(code) ||
      !(await this.totp.verifyCode(account.twoFactorSecret, code))
    ) {
      await this.gateway.recordFailure({ operatorId: account.id, ip: context.ip });
      throw new FieldsError([
        { field: 'code', problem: ServerFieldProblemCode.Incorrect, messageKey: 'CodeIncorrect' },
      ]);
    }

    const backupCodes = this.generateBackupCodes();
    const hashes = await Promise.all(
      backupCodes.map((candidate) => this.passwords.hash(candidate)),
    );
    const session = await this.gateway.run(async (tx) => {
      const at = this.settings.now();
      await this.gateway.confirmTwoFactor(tx, account.id, at);
      await this.gateway.insertBackupCodes(tx, account.id, hashes);
      return this.openSession(tx, account.id, context);
    });
    return { ...session, backupCodes };
  }

  /** A TOTP code or a backup code, for every sign-in once enrollment is confirmed. */
  async verify(
    email: string,
    password: string,
    code: string,
    context: OperatorSessionContext,
  ): Promise<OpenedOperatorSession> {
    const account = await this.authenticate(email, password, context.ip);
    if (account.twoFactorConfirmedAt === null || account.twoFactorSecret === null) {
      throw new ApiError('forbidden', 'TwoFactorIncomplete', { next: 'enroll-2fa' });
    }

    if (TOTP_CODE_PATTERN.test(code)) {
      if (await this.totp.verifyCode(account.twoFactorSecret, code)) {
        return this.gateway.run((tx) => this.openSession(tx, account.id, context));
      }
      throw await this.wrongCode(account.id, context.ip);
    }

    const candidates = await this.gateway.run((tx) =>
      this.gateway.findValidBackupCodes(tx, account.id),
    );
    for (const candidate of candidates) {
      if (await this.passwords.verify(code, candidate.codeHash)) {
        return this.gateway.run(async (tx) => {
          await this.gateway.markBackupCodeUsed(tx, candidate.id, this.settings.now());
          return this.openSession(tx, account.id, context);
        });
      }
    }
    throw await this.wrongCode(account.id, context.ip);
  }

  /**
   * ADM-01: regenerates the ten backup codes, invalidating the old set in the same transaction. Already
   * session-guarded (the caller resolves `operatorId` from the session), so this re-asserts the password
   * and a second factor (TOTP or a still-valid backup code) as a step-up check before destroying anything —
   * a session cookie alone must not be enough to wipe the account's own recovery codes.
   */
  async regenerateBackupCodes(
    operatorId: string,
    password: string,
    code: string,
    ip: string | null = null,
  ): Promise<string[]> {
    await this.refuseIfLocked(operatorId);
    const account = await this.gateway.run((tx) => this.gateway.findById(tx, operatorId));
    if (!account || !(await this.passwords.verify(password, account.passwordHash))) {
      await this.gateway.recordFailure({ operatorId, ip });
      throw new ApiError('unauthenticated', 'OperatorCredentialsWrong', {});
    }
    if (account.twoFactorConfirmedAt === null || account.twoFactorSecret === null) {
      throw new ApiError('forbidden', 'TwoFactorIncomplete', { next: 'enroll-2fa' });
    }
    if (!(await this.verifySecondFactor(account.id, account.twoFactorSecret, code))) {
      throw await this.wrongCode(account.id, ip);
    }

    const backupCodes = this.generateBackupCodes();
    const hashes = await Promise.all(
      backupCodes.map((candidate) => this.passwords.hash(candidate)),
    );
    await this.gateway.run(async (tx) => {
      await this.gateway.invalidateBackupCodes(tx, operatorId);
      await this.gateway.insertBackupCodes(tx, operatorId, hashes);
      // ADM-08: the platform's own record joins the same transaction.
      await this.platformAudit.recordWithin(tx, {
        actorType: PlatformActorType.Operator,
        actorId: operatorId,
        action: PlatformAuditAction.BackupCodesRegenerated,
        targetType: 'operator_account',
        targetId: operatorId,
        result: AuditResult.Success,
        ip: null,
        summary: {},
      });
    });
    return backupCodes;
  }

  /**
   * TOTP first, then any still-valid backup code, same order `verify` uses. Never marks a matched backup
   * code used -- the caller (`regenerateBackupCodes`) deletes the whole set immediately after anyway.
   */
  private async verifySecondFactor(
    operatorId: string,
    twoFactorSecret: string,
    code: string,
  ): Promise<boolean> {
    if (TOTP_CODE_PATTERN.test(code)) {
      return this.totp.verifyCode(twoFactorSecret, code);
    }
    const candidates = await this.gateway.run((tx) =>
      this.gateway.findValidBackupCodes(tx, operatorId),
    );
    for (const candidate of candidates) {
      if (await this.passwords.verify(code, candidate.codeHash)) return true;
    }
    return false;
  }

  /** Who is signed in, for the sidebar's foot and the account page ("7 of 10 unused"). */
  async me(session: OperatorSessionRecord): Promise<OperatorMe> {
    const [account, codes] = await this.gateway.run(
      async (tx) =>
        [
          await this.gateway.findById(tx, session.operatorId),
          await this.gateway.findValidBackupCodes(tx, session.operatorId),
        ] as const,
    );
    if (!account) throw new ApiError('unauthenticated', 'SignInToContinue', {});
    return {
      email: account.email,
      unusedBackupCodes: codes.length,
      signedInAt: session.createdAt,
      userAgent: session.userAgent,
    };
  }

  async resolve(cookieHeader: string | undefined): Promise<OperatorSessionRecord | null> {
    const token = this.readToken(cookieHeader);
    if (token === null) return null;
    return this.gateway.findActiveSession(this.digest(token), this.settings.now());
  }

  /** Compared in constant time (SEC-14), the same discipline as the tenant dashboard's own CSRF check. */
  /** TEN-29: the cookie's name, `__Host-` prefixed wherever cookies are Secure. */
  get cookieName(): string {
    return sessionCookieName(OPERATOR_SESSION_COOKIE, this.settings.secureCookies);
  }

  /** TEN-29: whether a state-changing request may come from this Origin. */
  originAllowed(origin: string | undefined): boolean {
    return originAllowed(origin, this.settings.origin);
  }

  csrfMatches(session: { csrfHash: string }, received: string | undefined): boolean {
    if (received === undefined) return false;
    const a = Buffer.from(this.digest(received));
    const b = Buffer.from(session.csrfHash);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  async revoke(sessionId: string): Promise<void> {
    await this.gateway.revokeSession(sessionId, this.settings.now());
  }

  clearCookie(): string {
    return `${this.cookieName}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${this.secureSuffix()}`;
  }

  /** A password-only check, with the same timing whether the email is unknown or the password is wrong (AUTH-13's rule, applied to operators too). */
  private async authenticate(
    email: string,
    password: string,
    ip: string | null,
  ): Promise<OperatorAccountRecord> {
    const account = await this.gateway.run((tx) => this.gateway.findByEmail(tx, email));
    if (account) await this.refuseIfLocked(account.id);
    const ok = account
      ? await this.passwords.verify(password, account.passwordHash)
      : await this.passwords.verifyAbsent(password);
    if (!account || !ok) {
      await this.gateway.recordFailure({ operatorId: account?.id ?? null, ip });
      throw new ApiError('unauthenticated', 'OperatorCredentialsWrong', {});
    }
    return account;
  }

  /** ADM-01, on AUTH-14's rule: five failures in fifteen minutes lock the account, even to the right password. */
  private async refuseIfLocked(operatorId: string): Promise<void> {
    if ((await this.failuresInWindow(operatorId)) >= SIGNIN_MAX_FAILURES) {
      throw new ApiError('rate_limited', 'TooManyFailedSignins', {}, SIGNIN_WINDOW_MS / 1000);
    }
  }

  private failuresInWindow(operatorId: string): Promise<number> {
    const since = new Date(this.settings.now().getTime() - SIGNIN_WINDOW_MS);
    return this.gateway.countFailuresSince(operatorId, since);
  }

  /** A wrong code counts, and says how many tries are left: the password has been proven by this point. */
  private async wrongCode(operatorId: string, ip: string | null): Promise<ApiError> {
    await this.gateway.recordFailure({ operatorId, ip });
    const attemptsLeft = Math.max(
      SIGNIN_MAX_FAILURES - (await this.failuresInWindow(operatorId)),
      0,
    );
    return new ApiError('unauthenticated', 'OperatorCodeWrong', { attemptsLeft }, undefined, {
      attemptsLeft,
    });
  }

  private async openSession(
    tx: Transaction,
    operatorId: string,
    context: OperatorSessionContext,
  ): Promise<OpenedOperatorSession> {
    const token = randomBytes(32).toString('base64url');
    const csrfToken = randomBytes(32).toString('base64url');
    await this.gateway.insertSession(tx, {
      tokenHash: this.digest(token),
      csrfHash: this.digest(csrfToken),
      operatorId,
      expiresAt: new Date(this.settings.now().getTime() + OPERATOR_SESSION_TTL_MS),
      userAgent: context.userAgent,
      ip: context.ip,
    });
    return { cookie: this.cookieFor(token), csrfToken };
  }

  private generateBackupCodes(): string[] {
    return Array.from({ length: BACKUP_CODE_COUNT }, () => randomBytes(5).toString('hex'));
  }

  private cookieFor(token: string): string {
    const maxAge = Math.floor(OPERATOR_SESSION_TTL_MS / 1000);
    // SEC-14's minimum is Lax; Strict is used here outright since the operator console has no cross-site
    // redirect flow (no OAuth, no payment page) that would need the cookie carried cross-site.
    return `${this.cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${String(maxAge)}${this.secureSuffix()}`;
  }

  private secureSuffix(): string {
    return this.settings.secureCookies ? '; Secure' : '';
  }

  private readToken(cookieHeader: string | undefined): string | null {
    if (!cookieHeader) return null;
    for (const part of cookieHeader.split(';')) {
      const [name, ...rest] = part.trim().split('=');
      if (name === this.cookieName && rest.length > 0) return rest.join('=');
    }
    return null;
  }

  private digest(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }
}
