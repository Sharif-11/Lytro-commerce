import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { DatabaseConnector, type DatabaseHandle, JobOutboxRepository } from '../src/index';

import { ADMIN_URL, appDbUrl, testDbUrl } from './config';
import { connect } from './helpers';

// SCL-08, D25, D27: the enqueue step's own columns, including the per-job send() options a retry needs.
let admin: pg.Client;
let handle: DatabaseHandle;

beforeAll(async () => {
  admin = await connect(testDbUrl(ADMIN_URL));
  handle = new DatabaseConnector().connect(appDbUrl(ADMIN_URL));
});

afterAll(async () => {
  await handle.close();
  await admin.end();
});

describe('job outbox send options (D27)', () => {
  it('stores and claims the per-job expireInSeconds, retryLimit and retryDelay', async () => {
    await handle.db.transaction(async (tx) => {
      await new JobOutboxRepository().insert(tx, {
        queueName: 'otp_retry',
        payload: { marker: 'with-options' },
        expireInSeconds: 240,
        retryLimit: 2,
        retryDelay: 20,
      });
    });

    const claimed = await new JobOutboxRepository().claimDue(handle.db, {
      now: new Date(),
      leaseUntil: new Date(Date.now() + 60_000),
      limit: 10,
    });
    const row = claimed.find(
      (r) => r.payload != null && (r.payload as { marker?: string }).marker === 'with-options',
    );
    expect(row).toMatchObject({ expireInSeconds: 240, retryLimit: 2, retryDelay: 20 });
  });

  it('leaves the options null when a job does not set them', async () => {
    await handle.db.transaction(async (tx) => {
      await new JobOutboxRepository().insert(tx, {
        queueName: 'otp_retry',
        payload: { marker: 'no-options' },
      });
    });

    const claimed = await new JobOutboxRepository().claimDue(handle.db, {
      now: new Date(),
      leaseUntil: new Date(Date.now() + 60_000),
      limit: 10,
    });
    const row = claimed.find(
      (r) => r.payload != null && (r.payload as { marker?: string }).marker === 'no-options',
    );
    expect(row).toMatchObject({ expireInSeconds: null, retryLimit: null, retryDelay: null });
  });
});
