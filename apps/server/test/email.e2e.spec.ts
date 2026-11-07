import 'dotenv/config';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TransactionRunner } from '@lytronix/db';
import { AppModule } from '../src/app/app.module';
import { EnvironmentParser } from '../src/config/env';
import { DatabaseService } from '../src/database/database.service';
import type { LowBalanceNotifier } from '../src/modules/balance/ports/low-balance-notifier';
import { LOW_BALANCE_NOTIFIER } from '../src/modules/balance/tokens';
import * as billingWords from '../src/modules/billing/services/billing-notice-words';
import type { ListenerNotifier } from '../src/modules/listener/ports/listener-notifier';
import { LISTENER_NOTIFIER } from '../src/modules/listener/tokens';
import { mailModeOf } from '../src/modules/shared/mail/providers/mail-provider-choice';
import {
  MailRefused,
  ResendMailProvider,
  type MailFetch,
} from '../src/modules/shared/mail/providers/resend-mail.provider';
import { MailService } from '../src/modules/shared/mail/services/mail.service';
import type { MailProvider } from '../src/modules/shared/mail/ports/mail-provider';
import type { MailStore } from '../src/modules/shared/mail/ports/mail-store';
import { verifySvixSignature } from '../src/modules/shared/mail/services/svix-signature';
import { MAIL_PROVIDER } from '../src/modules/shared/mail/tokens';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';
import { postJson, type HttpResult } from './support/http';
import { MailCapture } from './support/mail-capture';
import { errorOf, openShop, type ShopClient } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';

// D7-3, D7-22, NTF-06, I18N-01 (Phase 7 Slice 7.3, read agreed 2026-11-07): Lytro's email through Resend, over real HTTP
// and the real database. Each email is sent with the outbox's own key; a refusal is final and a busy Resend is tried
// again; a signed bounce or complaint stops the address until a code reaches it; notices go in the language the person
// chose, Bangla until then; the owner's notices follow the email they sign in with; Lytro's own notices reach its
// operators. Runs only when DATABASE_TEST_ADMIN_URL is set; the parts without a database always run.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_email_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;
const WEBHOOK_SECRET = `whsec_${randomBytes(24).toString('base64')}`;

const SETTINGS = {
  baseUrl: 'https://api.resend.test',
  apiKey: 're_key',
  from: 'Lytro <no-reply@mail.lytro.app>',
};

/** A fetch that answers once with this status and body, and keeps what it was asked. */
function answering(
  status: number,
  body: unknown,
): { fetch: MailFetch; calls: { url: string; init: RequestInit }[] } {
  const calls: { url: string; init: RequestInit }[] = [];
  return {
    calls,
    fetch: (url, init) => {
      calls.push({ url, init });
      return Promise.resolve(
        new Response(JSON.stringify(body), {
          status,
          headers: { 'content-type': 'application/json' },
        }),
      );
    },
  };
}

describe("Resend's adapter (D7-3)", () => {
  it("posts the email over HTTPS with the key, the sender and the outbox key, and keeps Resend's ID", async () => {
    const resend = answering(200, { id: 'msg-1' });
    const provider = new ResendMailProvider(SETTINGS, resend.fetch);
    const sent = await provider.send({
      to: 'owner@example.com',
      subject: 'আপনার ব্যালেন্স কম',
      body: 'টপ-আপ করুন।',
      idempotencyKey: 'lytro-mail-7',
    });
    expect(sent).toEqual({ providerMessageId: 'msg-1' });
    const call = resend.calls[0];
    expect(call?.url).toBe('https://api.resend.test/emails');
    const headers = call?.init.headers as Record<string, string>;
    expect(headers['authorization']).toBe('Bearer re_key');
    expect(headers['idempotency-key']).toBe('lytro-mail-7');
    expect(JSON.parse(call?.init.body as string)).toEqual({
      from: 'Lytro <no-reply@mail.lytro.app>',
      to: ['owner@example.com'],
      subject: 'আপনার ব্যালেন্স কম',
      text: 'টপ-আপ করুন।',
    });
  });

  it('calls a refusal final, and a busy or broken Resend worth trying again', async () => {
    for (const [status, name] of [
      [422, 'validation_error'],
      [403, 'validation_error'],
      [409, 'invalid_idempotent_request'],
    ] as const) {
      const provider = new ResendMailProvider(SETTINGS, answering(status, { name }).fetch);
      await expect(provider.send({ to: 'a@b.c', subject: 's', body: 'b' })).rejects.toBeInstanceOf(
        MailRefused,
      );
    }
    for (const [status, name] of [
      [429, 'rate_limit_exceeded'],
      [500, 'application_error'],
      [409, 'concurrent_idempotent_requests'],
    ] as const) {
      const provider = new ResendMailProvider(SETTINGS, answering(status, { name }).fetch);
      const failure = provider.send({ to: 'a@b.c', subject: 's', body: 'b' });
      await expect(failure).rejects.toThrow(/could not take the email now/);
      await expect(failure).rejects.not.toBeInstanceOf(MailRefused);
    }
  });

  it('is never called over plain HTTP', () => {
    expect(
      () =>
        new ResendMailProvider(
          { ...SETTINGS, baseUrl: 'http://api.resend.com' },
          answering(200, {}).fetch,
        ),
    ).toThrow(/HTTPS/);
  });
});

describe("the outbox's answer to Resend (D7-3)", () => {
  /** An outbox with one email due, keeping what the service did with it. */
  function outboxWith(provider: MailProvider): {
    service: MailService;
    failed: { attempts: number; nextAttemptAt: Date | null }[];
    sent: number[];
  } {
    const failed: { attempts: number; nextAttemptAt: Date | null }[] = [];
    const sent: number[] = [];
    const store: MailStore = {
      insert: () => Promise.resolve(1),
      claimDue: () =>
        Promise.resolve([
          {
            id: 9,
            toEmail: 'owner@example.com',
            kind: 'lifecycle_notice',
            subject: 's',
            body: 'b',
            attempts: 0,
          },
        ]),
      markSent: (id) => {
        sent.push(id);
        return Promise.resolve();
      },
      markFailed: (_id, input) => {
        failed.push({ attempts: input.attempts, nextAttemptAt: input.nextAttemptAt });
        return Promise.resolve();
      },
      markSuppressed: () => Promise.resolve(),
      isSuppressed: () => Promise.resolve(false),
      lift: () => Promise.resolve(false),
      suppress: () => Promise.resolve(),
    };
    return {
      service: new MailService(store, provider, () => new Date('2026-11-07T06:00:00Z')),
      failed,
      sent,
    };
  }

  it('gives up at once on a refusal, tries a busy Resend again, and sends each email with its own key', async () => {
    const refused = outboxWith({
      send: () => Promise.reject(new MailRefused(422, 'validation_error')),
    });
    await refused.service.runDue();
    expect(refused.failed).toEqual([{ attempts: 1, nextAttemptAt: null }]);

    const busy = outboxWith({
      send: () => Promise.reject(new Error('Resend could not take the email now (503)')),
    });
    await busy.service.runDue();
    expect(busy.failed).toEqual([{ attempts: 1, nextAttemptAt: new Date('2026-11-07T06:01:00Z') }]);

    const keys: (string | undefined)[] = [];
    const fine = outboxWith({
      send: (message) => {
        keys.push(message.idempotencyKey);
        return Promise.resolve({ providerMessageId: 'msg-9' });
      },
    });
    await fine.service.runDue();
    expect(fine.sent).toEqual([9]);
    expect(keys).toEqual(['lytro-mail-9']);
  });
});

describe('when an email really goes (D7-22)', () => {
  it('records in tests, prints in development unless forced, and sends in production', () => {
    expect(mailModeOf({ NODE_ENV: 'test', EMAIL_FORCE_REAL: true })).toBe('record');
    expect(mailModeOf({ NODE_ENV: 'development', EMAIL_FORCE_REAL: false })).toBe('log');
    expect(mailModeOf({ NODE_ENV: 'development', EMAIL_FORCE_REAL: true })).toBe('send');
    expect(mailModeOf({ NODE_ENV: 'production', EMAIL_FORCE_REAL: false })).toBe('send');
  });

  it("refuses production without Resend's key and bounce secret, and a forced development server without the key", () => {
    const SECRET = 'x'.repeat(40);
    const production = {
      DATABASE_URL: 'postgres://db',
      OTP_SECRET: SECRET,
      NODE_ENV: 'production',
      TRUSTED_EDGE_SECRET: SECRET,
      STOREFRONT_SECRET: SECRET,
      DATA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
      PLATFORM_ADDRESSES: '203.0.113.10',
      BULKSMSBD_API_KEY: 'key',
      BULKSMSBD_SENDER_ID: 'sender',
      GEMINI_API_KEY: 'key',
      VAPID_PUBLIC_KEY:
        'BBNykCoCcw3zvOh_47IKoxj6iE_nq2XIoPa-8QseO0wXT-0DXUxzLKt8gHBkgX1F6QGkLVde6Love1mB84r11Jw',
      VAPID_PRIVATE_KEY: 'rieyYsQvtJt6S0zEMB1SPZjCnUegO-FIvwL4XR2gFNw',
    };
    expect(() => new EnvironmentParser().parse(production)).toThrow(
      /RESEND_API_KEY: required in production.*RESEND_WEBHOOK_SECRET: required in production/s,
    );
    const env = new EnvironmentParser().parse({
      ...production,
      RESEND_API_KEY: 'key',
      RESEND_WEBHOOK_SECRET: 'whsec_c2VjcmV0',
    });
    expect(env.MAIL_FROM).toBe('Lytro <no-reply@mail.lytro.app>');
    expect(env.RESEND_BASE_URL).toBe('https://api.resend.com');
    expect(() =>
      new EnvironmentParser().parse({
        DATABASE_URL: 'postgres://db',
        OTP_SECRET: SECRET,
        EMAIL_FORCE_REAL: 'true',
      }),
    ).toThrow(/RESEND_API_KEY: required when EMAIL_FORCE_REAL is set/);
    expect(() =>
      new EnvironmentParser().parse({
        DATABASE_URL: 'postgres://db',
        OTP_SECRET: SECRET,
        RESEND_BASE_URL: 'http://api.resend.com',
      }),
    ).toThrow(/RESEND_BASE_URL/);
  });
});

describe("a bounce's signature (NTF-06)", () => {
  // Svix's own example (docs.svix.com, manual verification): its HMAC, checked at its own timestamp.
  const SVIX_SECRET = 'whsec_plJ3nmyCDGBKInavdOK15jsl';
  const SVIX_BODY = Buffer.from('{"event_type":"ping","data":{"success":true}}');
  const SVIX_HEADERS = {
    'svix-id': 'msg_loFOjxBNrRLzqYUf',
    'svix-timestamp': '1731705121',
    'svix-signature': 'v1,rAvfW3dJ/X/qxhsaXPOyyCGmRKsaKWcsNccKXlIktD0=',
  };
  const AT = new Date(1731705121 * 1000);

  it("accepts Svix's own example, and nothing changed or late", () => {
    expect(verifySvixSignature(SVIX_SECRET, SVIX_HEADERS, SVIX_BODY, AT)).toBe(true);
    expect(
      verifySvixSignature(SVIX_SECRET, SVIX_HEADERS, Buffer.from(`${SVIX_BODY.toString()} `), AT),
    ).toBe(false);
    expect(
      verifySvixSignature(
        SVIX_SECRET,
        SVIX_HEADERS,
        SVIX_BODY,
        new Date(AT.getTime() + 6 * 60_000),
      ),
    ).toBe(false);
    expect(verifySvixSignature('whsec_b3RoZXI=', SVIX_HEADERS, SVIX_BODY, AT)).toBe(false);
    expect(
      verifySvixSignature(
        SVIX_SECRET,
        { ...SVIX_HEADERS, 'svix-signature': `v2,${SVIX_HEADERS['svix-signature'].slice(3)}` },
        SVIX_BODY,
        AT,
      ),
    ).toBe(false);
    // One good signature among several is enough, as Svix sends them while a secret rotates.
    expect(
      verifySvixSignature(
        SVIX_SECRET,
        { ...SVIX_HEADERS, 'svix-signature': `v1,bm9wZQ== ${SVIX_HEADERS['svix-signature']}` },
        SVIX_BODY,
        AT,
      ),
    ).toBe(true);
  });
});

describe("the owner's notices in both languages (Slice 7.3's read)", () => {
  it('words every billing notice in Bangla and English, with nothing left unfilled', () => {
    const name = { bn: 'অতিরিক্ত প্রোডাক্ট', en: 'Extra products' };
    const all = [
      billingWords.addonEndingWords(
        name,
        '2026-12-01',
        billingWords.ADDON_NOT_RENEWING.switchedOff,
      ),
      billingWords.packBoughtWords(name, '200', 1, 3),
      billingWords.packFailedWords(name, '50.00', '200'),
      billingWords.addonPaymentToBalanceWords(
        '300',
        name,
        billingWords.ADDON_NOT_TAKEN.alreadyActive,
      ),
      billingWords.addonsNotRenewedWords(name, '120.00'),
      billingWords.downgradeFinalWarningWords([{ key: 'products', used: 120, limit: 100 }]),
      billingWords.retentionShrinkWords({
        oldDays: 90,
        newDays: 30,
        trimmed: 4,
        from: { bn: '2026-12-01', en: 'Tue Dec 01 2026' },
      }),
      billingWords.renewalReminderWords(3),
      billingWords.renewalReminderWords(null),
      billingWords.deletionWarningWords(3),
      billingWords.paygArchiveWarningWords(7),
      billingWords.shopClosedWords('Megh', '2026-12-31'),
      billingWords.planActiveWords({
        planName: 'Starter',
        until: '2026-12-31',
        invoiceNumber: 12,
        amount: '500',
      }),
    ];
    for (const words of all) {
      for (const text of [words.bn.subject, words.bn.body]) {
        expect(text).toMatch(/[ঀ-৿]/);
        expect(text).not.toMatch(/undefined|null|\{|\}/);
      }
      for (const text of [words.en.subject, words.en.body]) {
        expect(text).not.toMatch(/[ঀ-৿]/);
        expect(text).not.toMatch(/undefined|null|\{|\}/);
      }
    }
  });
});

let app: INestApplication;
let port: number;
let admin: pg.Client;
const texts = new SmsCapture();
const mail = new MailCapture();

describeIfDatabase('email over the real stack', () => {
  let shop: ShopClient;
  const ownerEmail = `owner-${randomUUID().slice(0, 8)}@example.com`;

  beforeAll(async () => {
    if (!ADMIN_URL) return;
    const urls = await prepareTestDatabase(ADMIN_URL, DB_NAME);
    process.env['DATABASE_URL'] = urls.appDbUrl;
    process.env['OTP_SECRET'] = 'email-e2e-otp-secret-0123456789abcdefghij';
    process.env['PLATFORM_DOMAIN'] = 'localhost';
    process.env['RESEND_WEBHOOK_SECRET'] = WEBHOOK_SECRET;
    admin = new pg.Client({ connectionString: urls.adminDbUrl });
    await admin.connect();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(SMS_PROVIDER)
      .useValue(texts.provider)
      .overrideProvider(MAIL_PROVIDER)
      .useValue(mail.provider)
      .compile();
    ({ app, port } = await listenOn(moduleRef));
    shop = await openShop(port, texts, 'email');
  });

  afterAll(async () => {
    if (!ADMIN_URL) return;
    await app.close();
    await admin.end();
    delete process.env['RESEND_WEBHOOK_SECRET'];
  });

  async function ownerRowEmail(): Promise<string | null> {
    const { rows } = await admin.query<{ email: string | null }>(
      'SELECT email FROM tenant.users WHERE tenant_id = $1 AND is_owner',
      [shop.tenantId],
    );
    return rows[0]?.email ?? null;
  }

  async function lowBalanceNotice(): Promise<void> {
    const runner = app.get(TransactionRunner);
    const db = app.get(DatabaseService).handle.db;
    await runner.run(db, (tx) =>
      app
        .get<LowBalanceNotifier>(LOW_BALANCE_NOTIFIER)
        .notifyCrossed(tx, shop.tenantId, 10_000n, '80.00'),
    );
  }

  async function lastOutbox(to: string): Promise<{ id: string; subject: string; status: string }> {
    const { rows } = await admin.query<{ id: string; subject: string; status: string }>(
      'SELECT id::text, subject, status FROM control.mail_outbox WHERE to_email = $1 ORDER BY id DESC LIMIT 1',
      [to],
    );
    const row = rows[0];
    if (!row) throw new Error(`no email to ${to}`);
    return row;
  }

  function signed(
    payload: unknown,
    secret = WEBHOOK_SECRET,
  ): { body: string; headers: Record<string, string> } {
    const body = JSON.stringify(payload);
    const id = `msg_${randomUUID()}`;
    const timestamp = String(Math.floor(Date.now() / 1000));
    const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
    const signature = createHmac('sha256', key)
      .update(`${id}.${timestamp}.${body}`)
      .digest('base64');
    return {
      body,
      headers: { 'svix-id': id, 'svix-timestamp': timestamp, 'svix-signature': `v1,${signature}` },
    };
  }

  function webhook(payload: unknown, secret?: string): Promise<HttpResult> {
    const { body, headers } = signed(payload, secret);
    return postJson(port, '/webhooks/email/resend', JSON.parse(body) as unknown, {
      host: 'localhost',
      ...headers,
    });
  }

  function bounce(to: string, type: 'Permanent' | 'Temporary'): Record<string, unknown> {
    return {
      type: 'email.bounced',
      created_at: new Date().toISOString(),
      data: {
        email_id: randomUUID(),
        from: 'Lytro <no-reply@mail.lytro.app>',
        to: [to],
        subject: 'আপনার ব্যালেন্স কম',
        bounce: { type, subType: 'General', message: 'The mailbox does not exist.' },
      },
    };
  }

  async function me(): Promise<{ language: string | null; emailBounced: boolean }> {
    const result = await shop.get('/me');
    return result.body as { language: string | null; emailBounced: boolean };
  }

  it("sends the owner's notices to the email they add to their sign-in, an owner who signed up by phone (NTF-06)", async () => {
    expect(await ownerRowEmail()).toBeNull();
    const asked = await shop.post('/me/identities/code', { kind: 'email', value: ownerEmail });
    expect(asked.status).toBe(200);
    const added = await shop.post('/me/identities/verify', {
      kind: 'email',
      value: ownerEmail,
      code: mail.codeFor(ownerEmail),
    });
    expect(added.status).toBe(200);
    expect(await ownerRowEmail()).toBe(ownerEmail);
  });

  it('emails a code in both languages, the code first in each', () => {
    const code = mail.codeFor(ownerEmail);
    const sent = [...mail.sent].reverse().find((each) => each.to === ownerEmail);
    expect(sent?.subject).toBe('Lytro-এ লগইনের কোড / Your sign-in code');
    expect(sent?.body).toContain(`Lytro-এ লগইনের জন্য OTP হচ্ছে ${code}।`);
    expect(sent?.body).toContain(`Your code is ${code}.`);
  });

  it('writes a notice in Bangla until the owner chooses, then in the language they chose (I18N-01)', async () => {
    expect((await me()).language).toBeNull();
    await lowBalanceNotice();
    expect((await lastOutbox(ownerEmail)).subject).toBe('আপনার ব্যালেন্স কম');

    const chosen = await shop.put('/me/language', { language: 'en' });
    expect(chosen.status).toBe(200);
    expect(chosen.body).toEqual({ language: 'en', kept: true });
    expect((await me()).language).toBe('en');
    await lowBalanceNotice();
    expect((await lastOutbox(ownerEmail)).subject).toBe('Your balance is low');

    const refused = await shop.put('/me/language', { language: 'fr' });
    expect(refused.status).toBe(400);
    expect(errorOf(refused).code).toBe('validation_error');
  });

  it('refuses a webhook without a good signature, and changes nothing', async () => {
    const unsigned = await postJson(
      port,
      '/webhooks/email/resend',
      bounce(ownerEmail, 'Permanent'),
      {
        host: 'localhost',
      },
    );
    expect(unsigned.status).toBe(401);
    const forged = await webhook(
      bounce(ownerEmail, 'Permanent'),
      `whsec_${randomBytes(24).toString('base64')}`,
    );
    expect(forged.status).toBe(401);
    expect((await me()).emailBounced).toBe(false);
  });

  it('keeps emailing after a bounce Resend calls temporary', async () => {
    const answered = await webhook(bounce(ownerEmail, 'Temporary'));
    expect(answered.status).toBe(200);
    expect((await me()).emailBounced).toBe(false);
  });

  it('stops every email but a code after a bounce for good, and tells the owner (NTF-06)', async () => {
    await lowBalanceNotice();
    const waiting = await lastOutbox(ownerEmail);
    expect(waiting.status).toBe('pending');

    const answered = await webhook(bounce(ownerEmail.toUpperCase(), 'Permanent'));
    expect(answered.status).toBe(200);
    // Resend retries with the same message; a second stop is the same stop.
    expect((await webhook(bounce(ownerEmail, 'Permanent'))).status).toBe(200);
    const { rows } = await admin.query<{ reason: string; detail: string | null }>(
      'SELECT reason, detail FROM control.mail_suppressions WHERE email = $1',
      [ownerEmail],
    );
    expect(rows).toEqual([{ reason: 'bounced', detail: 'General: The mailbox does not exist.' }]);
    expect((await me()).emailBounced).toBe(true);

    const before = mail.sent.length;
    await app.get(MailService).runDue(50);
    const stopped = await admin.query<{ status: string }>(
      'SELECT status FROM control.mail_outbox WHERE id = $1',
      [waiting.id],
    );
    expect(stopped.rows[0]?.status).toBe('suppressed');
    expect(mail.sent.slice(before).some((each) => each.to === ownerEmail)).toBe(false);
  });

  it('sends a code to a stopped address, and a code that arrives lifts the stop', async () => {
    // The address was sent a code moments ago, when it was added; its resend wait is over by now in real life.
    await admin.query(
      "UPDATE control.verification_challenges SET created_at = created_at - interval '1 hour' WHERE destination = $1",
      [ownerEmail],
    );
    const asked = await postJson(
      port,
      '/auth/email/code',
      { email: ownerEmail },
      { host: 'localhost' },
    );
    expect(asked.status).toBe(200);
    const code = mail.codeFor(ownerEmail);
    expect(code).toMatch(/^\d{6}$/);
    const entered = await postJson(
      port,
      '/auth/email/verify',
      { email: ownerEmail, code },
      { host: 'localhost' },
    );
    expect(entered.status).toBe(200);
    expect((await me()).emailBounced).toBe(false);
  });

  it('stops an address marked as spam, and an owner who changes their email is emailed again', async () => {
    const complained = await webhook({
      type: 'email.complained',
      created_at: new Date().toISOString(),
      data: { email_id: randomUUID(), to: [`Owner <${ownerEmail}>`], subject: 'x' },
    });
    expect(complained.status).toBe(200);
    const { rows } = await admin.query<{ reason: string }>(
      'SELECT reason FROM control.mail_suppressions WHERE email = $1',
      [ownerEmail],
    );
    expect(rows).toEqual([{ reason: 'complained' }]);
    expect((await me()).emailBounced).toBe(true);

    const next = `owner-${randomUUID().slice(0, 8)}@example.com`;
    await shop.post('/me/identities/code', { kind: 'email', value: next });
    const added = await shop.post('/me/identities/verify', {
      kind: 'email',
      value: next,
      code: mail.codeFor(next),
    });
    expect(added.status).toBe(200);
    expect(await ownerRowEmail()).toBe(next);
    expect((await me()).emailBounced).toBe(false);

    // Removing it again sends the owner's notices back to the email that is left.
    const identities = await shop.get('/me/identities');
    const list = (identities.body as { identities: { id: string; kind: string; value: string }[] })
      .identities;
    const newest = list.find((identity) => identity.value === next);
    expect(newest).toBeDefined();
    const removed = await shop.delete(`/me/identities/${newest?.id ?? ''}`);
    expect(removed.status).toBe(200);
    expect(await ownerRowEmail()).toBe(ownerEmail);
  });

  it("emails Lytro's own notices to every operator, in English (D7-43)", async () => {
    const operator = `ops-${randomUUID().slice(0, 8)}@lytro.test`;
    await admin.query(
      'INSERT INTO control.operator_accounts (email, password_hash, two_factor_confirmed_at) VALUES ($1, $2, now())',
      [operator, 'not-a-real-hash'],
    );
    const unenrolled = `ops-${randomUUID().slice(0, 8)}@lytro.test`;
    await admin.query(
      'INSERT INTO control.operator_accounts (email, password_hash) VALUES ($1, $2)',
      [unenrolled, 'not-a-real-hash'],
    );
    const listener = app.get<ListenerNotifier>(LISTENER_NOTIFIER);
    await listener.unreadMessages({ day: '2026-11-07', total: 4 });
    await listener.deviceAutoRevoked({
      tenantId: null,
      deviceId: randomUUID(),
      name: 'Nagad-1',
      flags: 3,
    });
    const { rows } = await admin.query<{ to_email: string; subject: string }>(
      "SELECT to_email, subject FROM control.mail_outbox WHERE to_email LIKE 'ops-%' ORDER BY id",
    );
    expect(rows).toEqual([
      { to_email: operator, subject: 'Unreadable wallet messages on 2026-11-07' },
      { to_email: operator, subject: 'Listener phone revoked: Nagad-1' },
    ]);
  });
});
