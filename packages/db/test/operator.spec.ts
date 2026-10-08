import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import {
  DatabaseConnector,
  type DatabaseHandle,
  type OperatorAccountRow,
  OperatorAccountRepository,
  OperatorBackupCodeRepository,
  OperatorSessionRepository,
  PlatformAuditLogRepository,
} from '../src/index';
import { PlatformActorType, PlatformAuditAction, AuditResult } from '@lytronix/validators';

import { ADMIN_URL, appDbUrl, testDbUrl } from './config';
import { connect } from './helpers';

// ADM-01, ADM-18, D8: operator accounts, backup codes, sessions, and the platform audit log's first writer.
// Account creation is privileged (no INSERT grant on control.operator_accounts for the app role — only the
// create-operator script may create one, migration 0024), so account rows here are inserted through
// `adminHandle` (the schema owner), the same way create-operator.ts itself does; every other call runs as
// the app role through `handle`, exactly as the live app would.
let admin: pg.Client;
let handle: DatabaseHandle;
let adminHandle: DatabaseHandle;

const email = (): string => `operator.${randomUUID().slice(0, 8)}@lytronix.internal`;
const accounts = new OperatorAccountRepository();

async function createAccount(): Promise<OperatorAccountRow> {
  return accounts.insert(adminHandle.db, { email: email(), passwordHash: 'hash' });
}

beforeAll(async () => {
  admin = await connect(testDbUrl(ADMIN_URL));
  handle = new DatabaseConnector().connect(appDbUrl(ADMIN_URL));
  adminHandle = new DatabaseConnector().connect(testDbUrl(ADMIN_URL));
});

afterAll(async () => {
  await handle.close();
  await adminHandle.close();
  await admin.end();
});

describe('operator accounts (ADM-01)', () => {
  it('starts with no 2FA secret, then stores and confirms one', async () => {
    const created = await createAccount();
    expect(created.twoFactorSecret).toBeNull();
    expect(created.twoFactorConfirmedAt).toBeNull();

    await accounts.setTwoFactorSecret(handle.db, created.id, 'SECRET123');
    const withSecret = await accounts.findById(handle.db, created.id);
    expect(withSecret?.twoFactorSecret).toBe('SECRET123');
    expect(withSecret?.twoFactorConfirmedAt).toBeNull();

    const now = new Date();
    await accounts.confirmTwoFactor(handle.db, created.id, now);
    const confirmed = await accounts.findById(handle.db, created.id);
    expect(confirmed?.twoFactorConfirmedAt?.getTime()).toBe(now.getTime());
  });

  it('break-glass reset clears the secret and confirmation (ADM-18)', async () => {
    const created = await createAccount();
    await accounts.setTwoFactorSecret(handle.db, created.id, 'SECRET123');
    await accounts.confirmTwoFactor(handle.db, created.id, new Date());

    await accounts.resetTwoFactor(handle.db, created.id);
    const reset = await accounts.findById(handle.db, created.id);
    expect(reset).toMatchObject({ twoFactorSecret: null, twoFactorConfirmedAt: null });
  });

  it('finds an account by email, and null for an unknown one', async () => {
    const created = await createAccount();
    expect((await accounts.findByEmail(handle.db, created.email))?.email).toBe(created.email);
    expect(await accounts.findByEmail(handle.db, email())).toBeNull();
  });
});

describe('operator backup codes (ADM-01, ADM-18)', () => {
  it('ten codes are all valid until used, and a used one never returns again', async () => {
    const codes = new OperatorBackupCodeRepository();
    const account = await createAccount();

    const hashes = Array.from({ length: 10 }, (_, i) => `hash-${String(i)}`);
    await codes.insertMany(handle.db, account.id, hashes);
    const valid = await codes.findValidByOperator(handle.db, account.id);
    expect(valid).toHaveLength(10);

    const target = valid[0];
    if (!target) throw new Error('expected a backup code');
    await codes.markUsed(handle.db, target.id, new Date());
    const remaining = await codes.findValidByOperator(handle.db, account.id);
    expect(remaining).toHaveLength(9);
    expect(remaining.some((row) => row.id === target.id)).toBe(false);

    // Marking it used again has no further effect (it is already excluded).
    await codes.markUsed(handle.db, target.id, new Date());
    expect(await codes.findValidByOperator(handle.db, account.id)).toHaveLength(9);
  });

  it('regenerating invalidates the whole old set at once (break-glass, so the schema owner, not the app role)', async () => {
    const codes = new OperatorBackupCodeRepository();
    const account = await createAccount();
    await codes.insertMany(handle.db, account.id, ['a', 'b', 'c']);
    expect(await codes.findValidByOperator(handle.db, account.id)).toHaveLength(3);

    // No DELETE grant for the app role (migration 0024) — only the break-glass script does this.
    await codes.deleteAllForOperator(adminHandle.db, account.id);
    expect(await codes.findValidByOperator(handle.db, account.id)).toHaveLength(0);
  });
});

describe('operator sessions (SEC-14, D8)', () => {
  it('a session is active until revoked or expired', async () => {
    const sessions = new OperatorSessionRepository();
    const account = await createAccount();

    const future = new Date(Date.now() + 60_000);
    const inserted = await sessions.insert(handle.db, {
      tokenHash: randomUUID(),
      csrfHash: randomUUID(),
      operatorId: account.id,
      expiresAt: future,
      userAgent: null,
      ip: null,
    });
    const active = await sessions.findActiveByTokenHash(handle.db, inserted.tokenHash, new Date());
    expect(active?.id).toBe(inserted.id);

    await sessions.revoke(handle.db, inserted.id, new Date());
    expect(
      await sessions.findActiveByTokenHash(handle.db, inserted.tokenHash, new Date()),
    ).toBeNull();
  });

  it('an expired session is never active, even if never revoked', async () => {
    const sessions = new OperatorSessionRepository();
    const account = await createAccount();

    const past = new Date(Date.now() - 1000);
    const inserted = await sessions.insert(handle.db, {
      tokenHash: randomUUID(),
      csrfHash: randomUUID(),
      operatorId: account.id,
      expiresAt: past,
      userAgent: null,
      ip: null,
    });
    expect(
      await sessions.findActiveByTokenHash(handle.db, inserted.tokenHash, new Date()),
    ).toBeNull();
  });
});

describe('platform audit log (ADM-08, ADM-18)', () => {
  it('records a break-glass entry, insert-only', async () => {
    const account = await createAccount();

    await new PlatformAuditLogRepository().insert(handle.db, {
      actorType: PlatformActorType.Operator,
      actorId: account.id,
      action: PlatformAuditAction.BreakGlass2faReset,
      targetType: 'operator_account',
      targetId: account.id,
      result: AuditResult.Success,
      ip: null,
      summary: { email: account.email },
    });

    const row = await admin.query<{ action: string; target_id: string }>(
      'SELECT action, target_id FROM control.platform_audit_log WHERE actor_id = $1',
      [account.id],
    );
    expect(row.rows[0]).toMatchObject({ action: 'break_glass_2fa_reset', target_id: account.id });
  });
});
