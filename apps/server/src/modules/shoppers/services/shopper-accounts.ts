import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Transaction } from '@lytronix/db';
import {
  AuditAction,
  SHOPPER_SESSION_DAYS,
  ServerFieldProblemCode,
  type ShopperPasswordInput,
  type ShopperProfileInput,
  type ShopperSigninInput,
  type ShopperSignupInput,
} from '@lytronix/validators';
import { ApiError, FieldsError } from '../../../common/api-error';
import { DAY_MS } from '../../../common/time';
import { CatalogueActivity } from '../../catalogue/services/catalogue-activity';
import type { CatalogueActor } from '../../catalogue/types/catalogue';
import { MAX_WRONG_ATTEMPTS } from '../../identity/services/one-time-code.service';
import { OneTimeCodeHasher } from '../../identity/services/one-time-code-hasher';
import { PasswordHasher } from '../../identity/services/password-hasher';
import { SIGNIN_MAX_FAILURES, SIGNIN_WINDOW_MS } from '../../identity/services/sign-in-lockout';
import type { ShopperStore } from '../ports/shopper-store';
import { SHOPPER_STORE, SHOPPERS_CLOCK } from '../tokens';
import type {
  ShopperRecord,
  ShopperSignedIn,
  ShopperView,
  SignedInShopper,
} from '../types/shoppers';

/** A sign-in token as it is stored: its hash only, so a copy of the table signs no one in. */
function tokenHashOf(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function shopperViewOf(shopper: ShopperRecord): ShopperView {
  return { id: shopper.id, name: shopper.name, phone: shopper.phone, createdAt: shopper.createdAt };
}

/**
 * CUS-03, CUS-05, CUS-14 (Phase 4 Slice 4.4b, read agreed 2026-10-30): a shopper's account in one shop. It is made with
 * the code sent to the phone (CUS-04) and a name and password; after that the shopper signs in with phone and password,
 * no code, and gets a token that lasts SHOPPER_SESSION_DAYS. Five wrong passwords within fifteen minutes lock the
 * account for the rest of them (AUTH-14's rule); a phone with no account is answered just as a wrong password is. A
 * shopper renames themself and changes their password, which ends their other sign-ins; a forgotten password is set
 * again by the shop's staff, which ends them all.
 */
@Injectable()
export class ShopperAccounts {
  constructor(
    @Inject(SHOPPER_STORE) private readonly store: ShopperStore,
    @Inject(OneTimeCodeHasher) private readonly codes: OneTimeCodeHasher,
    @Inject(PasswordHasher) private readonly passwords: PasswordHasher,
    @Inject(CatalogueActivity) private readonly activity: CatalogueActivity,
    @Inject(SHOPPERS_CLOCK) private readonly clock: () => Date,
  ) {}

  /** CUS-03: the account, made with the phone's code; the shopper is signed in with it. */
  async signUp(tenantId: string, input: ShopperSignupInput): Promise<ShopperSignedIn> {
    const passwordHash = await this.passwords.hash(input.password);
    const now = this.clock();
    const outcome = await this.store.run(tenantId, async (tx) => {
      const code = await this.store.latestCode(tx, tenantId, input.phone);
      if (!code || code.usedAt !== null || code.expiresAt <= now) {
        return { kind: 'expired' as const };
      }
      if (code.wrongAttempts >= MAX_WRONG_ATTEMPTS) return { kind: 'locked' as const };
      if (!this.codes.matches(input.code, input.phone, code.codeHash)) {
        await this.store.recordWrongCode(tx, tenantId, code.id);
        return { kind: 'wrong' as const };
      }
      const shopper = await this.store.insertShopper(tx, tenantId, {
        phone: input.phone,
        name: input.name,
        passwordHash,
      });
      if (!shopper) throw new ApiError('conflict', 'ShopperAlreadyRegistered', {});
      await this.store.useCode(tx, tenantId, code.id, now);
      return { kind: 'ok' as const, signedIn: await this.openSession(tx, tenantId, shopper, now) };
    });
    if (outcome.kind === 'ok') return outcome.signedIn;
    if (outcome.kind === 'locked') {
      throw new ApiError('rate_limited', 'TooManyWrongCodes', {});
    }
    throw new FieldsError([
      {
        field: 'code',
        problem:
          outcome.kind === 'wrong'
            ? ServerFieldProblemCode.Incorrect
            : ServerFieldProblemCode.Expired,
        messageKey: outcome.kind === 'wrong' ? 'CodeIncorrect' : 'CodeExpired',
      },
    ]);
  }

  /** CUS-03: phone and password, no code. A phone with no account is refused just as a wrong password is. */
  async signIn(tenantId: string, input: ShopperSigninInput): Promise<ShopperSignedIn> {
    const now = this.clock();
    const found = await this.store.run(tenantId, (tx) =>
      this.store.findByPhone(tx, tenantId, input.phone),
    );
    if (!found) {
      await this.passwords.verifyAbsent(input.password);
      throw this.wrongPassword();
    }
    if (this.locked(found, now)) {
      throw new ApiError('rate_limited', 'TooManyFailedSignins', {}, SIGNIN_WINDOW_MS / 1000);
    }
    const right = await this.passwords.verify(input.password, found.passwordHash);
    // The wrong password is counted in a transaction that commits; the refusal comes after it.
    const signedIn = await this.store.run(tenantId, async (tx) => {
      const shopper = await this.store.lock(tx, tenantId, found.id);
      if (!shopper) return null;
      if (!right) {
        const fresh =
          shopper.failingSince === null ||
          now.getTime() - shopper.failingSince.getTime() >= SIGNIN_WINDOW_MS;
        await this.store.updateShopper(tx, tenantId, shopper.id, {
          failedSignins: fresh ? 1 : shopper.failedSignins + 1,
          failingSince: fresh ? now : shopper.failingSince,
        });
        return null;
      }
      const cleared =
        shopper.failedSignins > 0
          ? await this.store.updateShopper(tx, tenantId, shopper.id, {
              failedSignins: 0,
              failingSince: null,
            })
          : shopper;
      return this.openSession(tx, tenantId, cleared, now);
    });
    if (!signedIn) throw this.wrongPassword();
    return signedIn;
  }

  /** CUS-05: the shopper a token signs in, or null when it is unknown or has expired. */
  authenticate(tenantId: string, token: string): Promise<SignedInShopper | null> {
    return this.store.run(tenantId, (tx) =>
      this.store.findSession(tx, tenantId, tokenHashOf(token), this.clock()),
    );
  }

  async signOut(tenantId: string, signedIn: SignedInShopper): Promise<void> {
    await this.store.run(tenantId, (tx) =>
      this.store.deleteSession(tx, tenantId, signedIn.sessionId),
    );
  }

  /** CUS-05: the shopper's name; the phone is the account and never changes. */
  rename(
    tenantId: string,
    signedIn: SignedInShopper,
    input: ShopperProfileInput,
  ): Promise<ShopperView> {
    return this.store.run(tenantId, async (tx) =>
      shopperViewOf(
        await this.store.updateShopper(tx, tenantId, signedIn.shopper.id, { name: input.name }),
      ),
    );
  }

  /** A new password, given the current one; the shopper's other sign-ins end. */
  async changePassword(
    tenantId: string,
    signedIn: SignedInShopper,
    input: ShopperPasswordInput,
  ): Promise<void> {
    if (!(await this.passwords.verify(input.currentPassword, signedIn.shopper.passwordHash))) {
      throw new FieldsError([
        {
          field: 'currentPassword',
          problem: ServerFieldProblemCode.Incorrect,
          messageKey: 'CurrentPasswordWrong',
        },
      ]);
    }
    const passwordHash = await this.passwords.hash(input.newPassword);
    await this.store.run(tenantId, async (tx) => {
      await this.store.updateShopper(tx, tenantId, signedIn.shopper.id, { passwordHash });
      await this.store.deleteSessions(tx, tenantId, signedIn.shopper.id, signedIn.sessionId);
    });
  }

  /**
   * CUS-14, agreed 2026-10-30: staff set a new password for the customer's account, told to the shopper by the shop
   * itself; every sign-in ends and the lock lifts. Audited, naming no password.
   */
  async setPasswordByStaff(
    tenantId: string,
    customerId: string,
    password: string,
    actor: CatalogueActor,
  ): Promise<void> {
    const who = await this.activity.resolve(tenantId, actor);
    const passwordHash = await this.passwords.hash(password);
    await this.store.run(tenantId, async (tx) => {
      const customer = await this.store.findCustomer(tx, tenantId, customerId);
      if (!customer || customer.erasedAt !== null || customer.phone === null) {
        throw new ApiError('not_found', 'CustomerNotFound', {});
      }
      const shopper = await this.store.findByPhone(tx, tenantId, customer.phone);
      if (!shopper) throw new ApiError('not_found', 'ShopperAccountNotFound', {});
      await this.store.updateShopper(tx, tenantId, shopper.id, {
        passwordHash,
        failedSignins: 0,
        failingSince: null,
      });
      await this.store.deleteSessions(tx, tenantId, shopper.id, null);
      await this.activity.record(
        tx,
        tenantId,
        who,
        AuditAction.ShopperPasswordSet,
        { type: 'customer', id: customer.id },
        {},
      );
    });
  }

  private async openSession(
    tx: Transaction,
    tenantId: string,
    shopper: ShopperRecord,
    now: Date,
  ): Promise<ShopperSignedIn> {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(now.getTime() + SHOPPER_SESSION_DAYS * DAY_MS);
    await this.store.insertSession(tx, tenantId, {
      shopperId: shopper.id,
      tokenHash: tokenHashOf(token),
      expiresAt,
    });
    return { token, expiresAt, shopper: shopperViewOf(shopper) };
  }

  private locked(shopper: ShopperRecord, now: Date): boolean {
    return (
      shopper.failedSignins >= SIGNIN_MAX_FAILURES &&
      shopper.failingSince !== null &&
      now.getTime() - shopper.failingSince.getTime() < SIGNIN_WINDOW_MS
    );
  }

  private wrongPassword(): ApiError {
    return new ApiError('unauthenticated', 'PhoneOrPasswordWrong', {});
  }
}
