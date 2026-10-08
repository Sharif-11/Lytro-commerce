import { Inject, Injectable } from '@nestjs/common';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Transaction } from '@lytronix/db';
import { ApiError } from '../../../common/api-error';
import { HOUR_MS } from '../../../common/time';
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
  ) {}

  /** Password only. Never opens a session — tells the caller whether to enroll or enter a code next. */
  async signin(email: string, password: string): Promise<OperatorSigninResult> {
    const account = await this.authenticate(email, password);
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
    const account = await this.authenticate(email, password);
    if (account.twoFactorConfirmedAt !== null) {
      throw new ApiError('conflict', 'This account is already enrolled.', {});
    }
    if (account.twoFactorSecret === null) {
      throw new ApiError('validation_error', 'Sign in again to get a new code to scan.', {});
    }
    if (
      !TOTP_CODE_PATTERN.test(code) ||
      !(await this.totp.verifyCode(account.twoFactorSecret, code))
    ) {
      throw new ApiError('validation_error', 'That code is not correct.', { field: 'code' });
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
    const account = await this.authenticate(email, password);
    if (account.twoFactorConfirmedAt === null || account.twoFactorSecret === null) {
      throw new ApiError('forbidden', 'Finish 2FA enrollment first.', { next: 'enroll-2fa' });
    }

    if (TOTP_CODE_PATTERN.test(code)) {
      if (await this.totp.verifyCode(account.twoFactorSecret, code)) {
        return this.gateway.run((tx) => this.openSession(tx, account.id, context));
      }
      throw this.invalidCode();
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
    throw this.invalidCode();
  }

  async resolve(cookieHeader: string | undefined): Promise<OperatorSessionRecord | null> {
    const token = this.readToken(cookieHeader);
    if (token === null) return null;
    return this.gateway.findActiveSession(this.digest(token), this.settings.now());
  }

  /** Compared in constant time (SEC-14), the same discipline as the tenant dashboard's own CSRF check. */
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
    return `${OPERATOR_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${this.secureSuffix()}`;
  }

  /** A password-only check, with the same timing whether the email is unknown or the password is wrong (AUTH-13's rule, applied to operators too). */
  private async authenticate(email: string, password: string): Promise<OperatorAccountRecord> {
    const account = await this.gateway.run((tx) => this.gateway.findByEmail(tx, email));
    const ok = account
      ? await this.passwords.verify(password, account.passwordHash)
      : await this.passwords.verifyAbsent(password);
    if (!account || !ok) {
      throw new ApiError('unauthenticated', 'Incorrect email or password.', {});
    }
    return account;
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
    return `${OPERATOR_SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${String(maxAge)}${this.secureSuffix()}`;
  }

  private secureSuffix(): string {
    return this.settings.secureCookies ? '; Secure' : '';
  }

  private readToken(cookieHeader: string | undefined): string | null {
    if (!cookieHeader) return null;
    for (const part of cookieHeader.split(';')) {
      const [name, ...rest] = part.trim().split('=');
      if (name === OPERATOR_SESSION_COOKIE && rest.length > 0) return rest.join('=');
    }
    return null;
  }

  private digest(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private invalidCode(): ApiError {
    return new ApiError('unauthenticated', 'That code is not valid.', {});
  }
}
