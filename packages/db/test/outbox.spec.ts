import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import {
  claimDueMessages,
  createDatabase,
  insertSmsMessage,
  markSmsFailed,
  markSmsSent,
  type DatabaseHandle,
} from '../src/index';
import { ADMIN_URL, appDbUrl, testDbUrl } from './config';
import { connect } from './helpers';

// SMS-18, D6, AUTH-05: the outbox. Claims are atomic, retries wait for their time, and an OTP text is never claimed.
let admin: pg.Client;
let handle: DatabaseHandle;

const phone = (): string => `0171${randomUUID().replace(/\D/g, '').slice(0, 7)}`;
const LATER = new Date(Date.now() + 60 * 60 * 1000);

beforeAll(async () => {
  admin = await connect(testDbUrl(ADMIN_URL));
  handle = createDatabase(appDbUrl(ADMIN_URL));
});

afterAll(async () => {
  await handle.close();
  await admin.end();
});

describe('outbox claiming (SMS-18)', () => {
  it('a message is claimed once; a second sender finds nothing', async () => {
    const id = await insertSmsMessage(handle.db, {
      toPhone: phone(),
      kind: 'shop_ready',
      body: 'Your shop is ready',
    });
    const now = new Date();
    const leaseUntil = new Date(now.getTime() + 120_000);
    const first = await claimDueMessages(handle.db, { now, leaseUntil, limit: 10, onlyId: id });
    const second = await claimDueMessages(handle.db, { now, leaseUntil, limit: 10, onlyId: id });
    expect(first.map((m) => m.id)).toEqual([id]);
    expect(second).toHaveLength(0);
  });

  it('a leased message is reclaimed only after its lease expires', async () => {
    const id = await insertSmsMessage(handle.db, {
      toPhone: phone(),
      kind: 'shop_ready',
      body: 'Ready',
    });
    const now = new Date();
    await claimDueMessages(handle.db, {
      now,
      leaseUntil: new Date(now.getTime() + 120_000),
      limit: 10,
      onlyId: id,
    });
    const during = await claimDueMessages(handle.db, {
      now: new Date(now.getTime() + 60_000),
      leaseUntil: LATER,
      limit: 10,
      onlyId: id,
    });
    const after = await claimDueMessages(handle.db, {
      now: new Date(now.getTime() + 180_000),
      leaseUntil: LATER,
      limit: 10,
      onlyId: id,
    });
    expect(during).toHaveLength(0);
    expect(after.map((m) => m.id)).toEqual([id]);
  });

  it('never claims an OTP, whose text is not stored', async () => {
    const id = await insertSmsMessage(handle.db, { toPhone: phone(), kind: 'otp', body: null });
    const claimed = await claimDueMessages(handle.db, {
      now: new Date(),
      leaseUntil: LATER,
      limit: 100,
      onlyId: id,
    });
    expect(claimed).toHaveLength(0);
  });
});

describe('outbox status (SMS-18)', () => {
  it('a failed attempt waits for its retry time, then is claimable again', async () => {
    const id = await insertSmsMessage(handle.db, {
      toPhone: phone(),
      kind: 'shop_ready',
      body: 'R',
    });
    const retryAt = new Date(Date.now() + 60_000);
    await markSmsFailed(handle.db, id, {
      error: 'provider down',
      attempts: 1,
      nextAttemptAt: retryAt,
    });

    const early = await claimDueMessages(handle.db, {
      now: new Date(),
      leaseUntil: LATER,
      limit: 10,
      onlyId: id,
    });
    const due = await claimDueMessages(handle.db, {
      now: new Date(retryAt.getTime() + 1000),
      leaseUntil: LATER,
      limit: 10,
      onlyId: id,
    });
    expect(early).toHaveLength(0);
    expect(due[0]?.attempts).toBe(1);
  });

  it('a final failure is recorded as failed and never claimed again', async () => {
    const id = await insertSmsMessage(handle.db, {
      toPhone: phone(),
      kind: 'shop_ready',
      body: 'R',
    });
    await markSmsFailed(handle.db, id, { error: 'gave up', attempts: 5, nextAttemptAt: null });
    const row = await admin.query<{ status: string; last_error: string }>(
      'SELECT status, last_error FROM control.sms_outbox WHERE id = $1',
      [id],
    );
    expect(row.rows[0]).toEqual({ status: 'failed', last_error: 'gave up' });
    const claimed = await claimDueMessages(handle.db, {
      now: new Date(Date.now() + 10 * 3600_000),
      leaseUntil: LATER,
      limit: 10,
      onlyId: id,
    });
    expect(claimed).toHaveLength(0);
  });

  it('a sent message records when it was sent', async () => {
    const id = await insertSmsMessage(handle.db, {
      toPhone: phone(),
      kind: 'shop_ready',
      body: 'R',
    });
    const at = new Date();
    await markSmsSent(handle.db, id, at);
    const row = await admin.query<{ status: string; sent_at: Date }>(
      'SELECT status, sent_at FROM control.sms_outbox WHERE id = $1',
      [id],
    );
    expect(row.rows[0]?.status).toBe('sent');
    expect(row.rows[0]?.sent_at.getTime()).toBe(at.getTime());
  });
});
