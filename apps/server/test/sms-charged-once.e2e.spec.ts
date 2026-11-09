import 'dotenv/config';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SmsLogKind } from '@lytronix/validators';
import { TransactionRunner } from '@lytronix/db';
import { AppModule } from '../src/app/app.module';
import { DatabaseService } from '../src/database/database.service';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { EssentialSmsUsageService } from '../src/modules/sms-usage/services/essential-sms-usage.service';
import { UsageWarnings } from '../src/modules/usage-warnings/services/usage-warnings';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';
import { postJson } from './support/http';
import { openShop } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';

// PHASE-7-PLAN §1, exit criterion 2 (the Phase 7 close-out, 2026-11-08): requests that arrive at once count each other.
// However many land together, a phone gets one code inside its cooldown, one address stays inside its cap, and a shop's
// last free SMS is taken once. Runs only when DATABASE_TEST_ADMIN_URL is set.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_sms_charged_once_test';
const CAP = 4;
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;

let app: INestApplication;
let port: number;
let admin: pg.Client;
const texts = new SmsCapture();

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const { adminDbUrl, appDbUrl } = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  admin = new pg.Client({ connectionString: adminDbUrl });
  await admin.connect();
  process.env['DATABASE_URL'] = appDbUrl;
  process.env['OTP_SECRET'] = 'sms-charged-once-e2e-otp-secret-0123456789ab';
  process.env['PLATFORM_DOMAIN'] = 'localhost';
  process.env['CODE_SMS_PER_IP_PER_HOUR'] = String(CAP);
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SMS_PROVIDER)
    .useValue(texts.provider)
    .compile();
  ({ app, port } = await listenOn(moduleRef));
});

afterAll(async () => {
  if (!ADMIN_URL) return;
  delete process.env['CODE_SMS_PER_IP_PER_HOUR'];
  await app.close();
  await admin.end();
});

const askFor = (phone: string) => postJson(port, '/auth/phone/code', { phone });

describeIfDatabase('SMS asked for at the same moment', () => {
  it('SMS-11: five requests for one phone send one code; the rest are told to wait', async () => {
    const phone = texts.freshPhone();
    const answers = await Promise.all([1, 2, 3, 4, 5].map(() => askFor(phone)));
    expect(answers.map((answer) => answer.status).sort()).toEqual([200, 429, 429, 429, 429]);
    expect(texts.countFor(phone)).toBe(1);
    const { rows } = await admin.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM control.verification_challenges WHERE destination = $1',
      [phone],
    );
    expect(rows[0]?.n).toBe(1);
  });

  it('SMS-11, D7-27: an address asking for many phones at once stays inside its cap', async () => {
    const phones = [1, 2, 3, 4, 5, 6, 7, 8].map(() => texts.freshPhone());
    const answers = await Promise.all(phones.map((phone) => askFor(phone)));
    // The test before used one of this address's four.
    expect(answers.filter((answer) => answer.status === 200)).toHaveLength(CAP - 1);
    expect(phones.reduce((sum, phone) => sum + texts.countFor(phone), 0)).toBe(CAP - 1);
  });

  it("SMS-04: a shop's last free SMS is taken once, and the rest are paid or refused", async () => {
    await admin.query('DELETE FROM control.verification_challenges WHERE requested_ip IS NOT NULL');
    const id = (await openShop(port, texts, 'lastfree')).tenantId;
    const limits = await app.get(UsageWarnings).limitsOf(id);
    const total = Number(limits?.essential_sms_total);
    expect(total).toBeGreaterThan(1);
    await admin.query('DELETE FROM control.essential_sms_usage WHERE tenant_id = $1', [id]);
    await admin.query(
      "INSERT INTO control.essential_sms_usage (tenant_id, kind, units) VALUES ($1, 'otp', $2)",
      [id, total - 1],
    );
    const usage = app.get(EssentialSmsUsageService);
    const db = app.get(DatabaseService).handle.db;
    const runner = app.get(TransactionRunner);
    const takes = await Promise.allSettled(
      [1, 2, 3, 4].map(() =>
        runner.run(db, (tx) => usage.takeForCode(tx, id, 'one unit', SmsLogKind.SigninCode)),
      ),
    );
    const free = takes.filter((take) => take.status === 'fulfilled' && take.value.usageId !== null);
    expect(free).toHaveLength(1);
    const { rows } = await admin.query<{ used: number }>(
      'SELECT sum(units)::int AS used FROM control.essential_sms_usage WHERE tenant_id = $1',
      [id],
    );
    expect(rows[0]?.used).toBe(total);
  });
});
