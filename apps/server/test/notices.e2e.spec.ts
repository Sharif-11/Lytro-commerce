import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from 'bcryptjs';
import { generate } from 'otplib';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  NoticeTemplate,
  NotificationKind,
  Permission,
  RateKey,
  noticePlainText,
  renderNoticeMarkdown,
} from '@lytronix/validators';
import { AppModule } from '../src/app/app.module';
import { dhakaTime } from '../src/common/i18n/dates';
import { NOTICE_TEMPLATES, noticeBellText, noticeIn } from '../src/modules/notices/notice-words';
import type { NoticeStore } from '../src/modules/notices/ports/notice-store';
import { NoticePublisher } from '../src/modules/notices/services/notice-publisher';
import type { NotificationStore } from '../src/modules/notifications/ports/notification-store';
import { PushSender } from '../src/modules/notifications/services/push-sender';
import { NOTIFICATION_STORE } from '../src/modules/notifications/tokens';
import { NOTICE_STORE } from '../src/modules/notices/tokens';
import { MAIL_PROVIDER } from '../src/modules/shared/mail/tokens';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { NoticePublishTickWorker } from '../src/modules/shared/queue-workers/services/notice-publish-tick-worker';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';
import { cookieFrom, getJson, patchJson, postJson, type HttpResult } from './support/http';
import { MailCapture } from './support/mail-capture';
import { errorOf, fieldsOf, openShop, staffWith, type ShopClient } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';

// NTC-01 to NTC-18, D7-53 to D7-58 (Phase 7 Slice 7.4, read agreed 2026-11-07): Lytro's notices over real HTTP and the
// real database. The operator writes one (a draft until it has a publish time); the minute pass sends it to every shop
// in its audience -- the bell and push to the owner and the staff with notices:read, an email to the owner when it is
// important or urgent, never an SMS -- and each shop's board shows it in the reader's language until it ends or is
// withdrawn. Urgent ones are a banner until closed, important ones a prompt until seen; "I understand" is the owner's,
// once per shop. Runs only when DATABASE_TEST_ADMIN_URL is set; the parts without a database always run.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_notices_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;
vi.setConfig({ testTimeout: 60_000 });

describe('the few marks a notice body may use (NTC-01, NTC-16, D7-53)', () => {
  it('escapes everything first, then makes bold, https links in a new tab, lists and paragraphs', () => {
    const html = renderNoticeMarkdown(
      'Hello <script>alert(1)</script> **now**\nsecond line\n\n- one\n- [help](https://lytro.app/help?a=1&b=2)',
    );
    expect(html).toBe(
      '<p>Hello &lt;script&gt;alert(1)&lt;/script&gt; <strong>now</strong><br>second line</p>' +
        '<ul><li>one</li><li><a href="https://lytro.app/help?a=1&amp;b=2" target="_blank" rel="noopener noreferrer">help</a></li></ul>',
    );
  });

  it('leaves a link that is not https as its text, and an attribute break-out as text', () => {
    expect(renderNoticeMarkdown('[x](javascript:alert)')).toBe('<p>x</p>');
    expect(renderNoticeMarkdown('[x](http://lytro.app)')).toBe('<p>x</p>');
    expect(renderNoticeMarkdown('[x](https://a.b/"onmouseover="y)')).not.toContain('"onmouseover');
  });

  it('writes a body as plain text for email and push', () => {
    expect(noticePlainText('**Bold** and [help](https://lytro.app/help)\n- one')).toBe(
      'Bold and help (https://lytro.app/help)\n• one',
    );
  });
});

describe('notice words (NTC-12, NTC-15)', () => {
  it('reads the reader language, or the other when it has none', () => {
    const englishOnly = { titleBn: null, bodyBn: null, titleEn: 'Hi', bodyEn: 'There' };
    expect(noticeIn(englishOnly, 'bn')).toEqual({ title: 'Hi', body: 'There', language: 'en' });
    const both = { titleBn: 'হ্যালো', bodyBn: 'বিস্তারিত', titleEn: 'Hi', bodyEn: 'There' };
    expect(noticeIn(both, 'en').title).toBe('Hi');
    expect(noticeIn(both, 'bn').title).toBe('হ্যালো');
  });

  it('keeps a bell row short: "From Lytro" and the start of the body, marks gone', () => {
    const bell = noticeBellText({
      titleBn: null,
      bodyBn: null,
      titleEn: 'Big news',
      bodyEn: `**Read** ${'word '.repeat(80)}`,
    });
    expect(bell.en.title).toBe('From Lytro: Big news');
    expect(bell.bn.title).toBe('Lytro থেকে: Big news');
    expect(bell.en.body.startsWith('Read word')).toBe(true);
    expect(bell.en.body.length).toBeLessThanOrEqual(160);
  });

  it('writes Dhaka times the way each language says them', () => {
    // 20:00 UTC is 2 am in Dhaka the next day; 10:30 UTC is 4:30 pm.
    expect(dhakaTime(new Date('2026-11-24T20:00:00Z'), 'en')).toBe('2 am');
    expect(dhakaTime(new Date('2026-11-24T20:00:00Z'), 'bn')).toBe('রাত 2টা');
    expect(dhakaTime(new Date('2026-11-25T10:30:00Z'), 'en')).toBe('4:30 pm');
    expect(dhakaTime(new Date('2026-11-25T10:30:00Z'), 'bn')).toBe('বিকাল 4:30');
  });

  it('fills the rate-change template from the rate and its two values', () => {
    const draft = NOTICE_TEMPLATES[NoticeTemplate.RateChange]({
      date: new Date('2026-10-31T20:00:00Z'),
      rate: { key: RateKey.SmsPerUnit, oldValue: '0.5500', newValue: '0.6000' },
      windowStartsAt: null,
      windowEndsAt: null,
      rateChangeId: 7,
    });
    expect(draft.titleEn).toBe('SMS, per part rate ৳0.55 → ৳0.6 from 1 Nov');
    expect(draft.titleBn).toBe('SMS, প্রতি পার্ট রেট 1 নভেম্বর থেকে ৳0.55 → ৳0.6');
    expect(draft.rateChangeId).toBe(7);
  });
});

let app: INestApplication;
let port: number;
let admin: pg.Client;
let operator: Record<string, string> = {};
let operatorEmail = '';
const texts = new SmsCapture();
const mail = new MailCapture();

interface BoardItem {
  id: string;
  title: string;
  body: string;
  html: string;
  language: string;
  category: string;
  severity: string;
  pinned: boolean;
  read: boolean;
  editedAt: string | null;
  acknowledgedAt: string | null;
}

interface Brief {
  id: string;
  title: string;
}

interface Summary {
  unread: number;
  banners: Brief[];
  prompts: Brief[];
  toAcknowledge: Brief[];
  maintenance: { id: string; startsAt: string; endsAt: string; underWay: boolean } | null;
}

interface OperatorNotice {
  id: string;
  status: string;
  sentAt: string | null;
  editedAt: string | null;
  titleEn: string | null;
  counts: { shops: number; people: number; reads: number; acknowledged: number };
}

const BASE = {
  titleBn: 'নতুন ফিচার',
  bodyBn: 'প্রোডাক্টের ল্যান্ডিং পেজে এখন সাইজ চার্ট।',
  titleEn: 'A new feature',
  bodyEn: 'Size charts are now on product landing pages.',
  category: 'new_feature',
  severity: 'info',
  audience: { kind: 'all' },
};

async function operatorHeaders(): Promise<Record<string, string>> {
  const password = 'notices-operator-9';
  const email = `operator.${randomUUID().slice(0, 8)}@lytronix.internal`;
  operatorEmail = email;
  await admin.query(
    'INSERT INTO control.operator_accounts (email, password_hash) VALUES ($1, $2)',
    [email, await hash(password, 12)],
  );
  const signedIn = await postJson(port, '/auth/operator/signin', { email, password });
  expect(signedIn.status, JSON.stringify(signedIn.body)).toBeLessThan(300);
  const code = await generate({ secret: (signedIn.body as { secret: string }).secret });
  const enrolled = await postJson(port, '/auth/operator/enroll', { email, password, code });
  return {
    cookie: cookieFrom(enrolled),
    'x-csrf-token': (enrolled.body as { csrfToken: string }).csrfToken,
  };
}

describeIfDatabase('the notice board over the real stack', () => {
  let shop: ShopClient;
  let other: ShopClient;
  let staff: Record<string, string>;
  let ownerId: string;
  let staffId: string;
  let bystanderId: string;
  let ownerEmail: string;

  beforeAll(async () => {
    if (!ADMIN_URL) return;
    const urls = await prepareTestDatabase(ADMIN_URL, DB_NAME);
    process.env['DATABASE_URL'] = urls.appDbUrl;
    process.env['OTP_SECRET'] = 'notices-e2e-otp-secret-0123456789abcdef';
    process.env['PLATFORM_DOMAIN'] = 'localhost';
    admin = new pg.Client({ connectionString: urls.adminDbUrl });
    await admin.connect();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(SMS_PROVIDER)
      .useValue(texts.provider)
      .overrideProvider(MAIL_PROVIDER)
      .useValue(mail.provider)
      // The spec runs each pass itself, so the minute cron never races it.
      .overrideProvider(NoticePublishTickWorker)
      .useValue({})
      .compile();
    ({ app, port } = await listenOn(moduleRef));
    operator = await operatorHeaders();
    shop = await openShop(port, texts, 'ntc');
    other = await openShop(port, texts, 'ntc');
    staff = await staffWith(port, texts, admin, shop, [Permission.NoticesRead]);
    ownerId = await ownerRow(shop.tenantId);
    staffId = await staffRowWith(shop.tenantId, Permission.NoticesRead);
    bystanderId = await bystander(shop.tenantId);
    ownerEmail = `owner.${randomUUID().slice(0, 8)}@example.com`;
    await admin.query(
      "UPDATE tenant.users SET email = $2, language = 'en' WHERE tenant_id = $1 AND is_owner",
      [shop.tenantId, ownerEmail],
    );
  });

  afterAll(async () => {
    if (!ADMIN_URL) return;
    await app.close();
    await admin.end();
  });

  beforeEach(async () => {
    if (!ADMIN_URL) return;
    // Each test starts with no notices, so a board shows only what the test publishes.
    await admin.query('DELETE FROM control.notice_reads');
    await admin.query('DELETE FROM control.notice_acknowledgments');
    await admin.query('DELETE FROM control.notice_deliveries');
    await admin.query('DELETE FROM control.notice_versions');
    await admin.query('UPDATE control.rate_history SET notice_id = NULL');
    await admin.query('DELETE FROM control.notices');
    await admin.query('DELETE FROM tenant.notifications WHERE kind = $1', [
      NotificationKind.LytroNotice,
    ]);
    await admin.query("UPDATE control.tenants SET state = 'trial' WHERE id = ANY($1::uuid[])", [
      [shop.tenantId, other.tenantId],
    ]);
  });

  async function ownerRow(tenantId: string): Promise<string> {
    const { rows } = await admin.query<{ id: string }>(
      'SELECT id FROM tenant.users WHERE tenant_id = $1 AND is_owner',
      [tenantId],
    );
    return rows[0]?.id ?? '';
  }

  /** The signed-in staff member's row: the one holding the permission. */
  async function staffRowWith(tenantId: string, permission: Permission): Promise<string> {
    const { rows } = await admin.query<{ id: string }>(
      `SELECT u.id FROM tenant.users u
       JOIN tenant.user_roles ur ON ur.tenant_id = u.tenant_id AND ur.user_id = u.id
       JOIN tenant.roles r ON r.tenant_id = ur.tenant_id AND r.id = ur.role_id
       WHERE u.tenant_id = $1 AND NOT u.is_owner AND $2 = ANY(r.permissions)`,
      [tenantId, permission],
    );
    return rows[0]?.id ?? '';
  }

  /** A staff member who doesn't hold notices:read, so is never told. */
  async function bystander(tenantId: string): Promise<string> {
    const role = await admin.query<{ id: string }>(
      'INSERT INTO tenant.roles (tenant_id, name, permissions) VALUES ($1, $2, $3::text[]) RETURNING id',
      [tenantId, `Orders ${randomUUID().slice(0, 6)}`, [Permission.OrdersRead]],
    );
    const user = await admin.query<{ id: string }>(
      `INSERT INTO tenant.users (tenant_id, phone, name, is_owner, active)
       VALUES ($1, $2, 'Bystander', false, true) RETURNING id`,
      [tenantId, texts.freshPhone()],
    );
    const userId = user.rows[0]?.id ?? '';
    await admin.query(
      'INSERT INTO tenant.user_roles (tenant_id, user_id, role_id) VALUES ($1, $2, $3)',
      [tenantId, userId, role.rows[0]?.id],
    );
    return userId;
  }

  const create = (body: Record<string, unknown>): Promise<HttpResult> =>
    postJson(port, '/operator/notices', body, operator);

  const tick = (): Promise<{ notices: number; shops: number }> =>
    app.get(NoticePublisher).runTick(new Date());

  /** A notice published a moment ago and sent. */
  async function published(body: Record<string, unknown> = {}): Promise<string> {
    const made = await create({ ...BASE, publishAt: new Date(Date.now() - 1000), ...body });
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    await tick();
    return (made.body as { id: string }).id;
  }

  async function board(client: ShopClient, query = '', language = 'bn'): Promise<BoardItem[]> {
    const listed = await getJson(
      port,
      `/notices${query}`,
      client.headers({ 'accept-language': language }),
    );
    expect(listed.status, JSON.stringify(listed.body)).toBe(200);
    return (listed.body as { items: BoardItem[] }).items;
  }

  async function summaryOf(headers: Record<string, string>): Promise<Summary> {
    const read = await getJson(port, '/notices/summary', headers);
    expect(read.status, JSON.stringify(read.body)).toBe(200);
    return read.body as Summary;
  }

  async function bellRows(
    noticeLink: string,
  ): Promise<{ user_id: string; words: { en: { title: string } } }[]> {
    const { rows } = await admin.query<{ user_id: string; words: { en: { title: string } } }>(
      'SELECT user_id, words FROM tenant.notifications WHERE tenant_id = $1 AND kind = $2 AND link = $3 ORDER BY user_id',
      [shop.tenantId, NotificationKind.LytroNotice, noticeLink],
    );
    return rows;
  }

  async function emailsTo(address: string): Promise<{ subject: string; body: string }[]> {
    const { rows } = await admin.query<{ subject: string; body: string }>(
      'SELECT subject, body FROM control.mail_outbox WHERE to_email = $1 ORDER BY id',
      [address],
    );
    return rows;
  }

  it('saves a notice with no publish time as a draft, and refuses one without a whole language (NTC-01)', async () => {
    const titleOnly = await create({ ...BASE, bodyBn: null, bodyEn: null });
    expect(titleOnly.status).toBe(400);
    expect(fieldsOf(titleOnly)).toMatchObject({ bodyBn: 'required', bodyEn: 'required' });
    const nothing = await create({
      category: 'general',
      severity: 'info',
      audience: { kind: 'all' },
    });
    expect(nothing.status).toBe(400);
    expect(fieldsOf(nothing)).toMatchObject({ titleBn: 'required' });
    const tooLong = await create({ ...BASE, titleEn: 'x'.repeat(121) });
    expect(tooLong.status).toBe(400);

    const draft = await create(BASE);
    expect(draft.status, JSON.stringify(draft.body)).toBe(201);
    expect((draft.body as OperatorNotice).status).toBe('draft');
    expect((await tick()).notices).toBe(0);
    expect(await board(shop)).toEqual([]);
  });

  it('keeps a body as typed and shows it inert; refuses a link that is not https (NTC-16)', async () => {
    const id = await published({
      bodyEn: 'Read <script>alert(1)</script> **this** [help](https://lytro.app/help)',
    });
    const [item] = await board(shop, '', 'en');
    expect(item?.id).toBe(id);
    expect(item?.body).toBe(
      'Read <script>alert(1)</script> **this** [help](https://lytro.app/help)',
    );
    expect(item?.html).toContain('&lt;script&gt;');
    expect(item?.html).not.toContain('<script>');
    expect(item?.html).toContain('<strong>this</strong>');
    expect(item?.html).toContain('target="_blank" rel="noopener noreferrer"');
    for (const target of ['http://lytro.app', 'javascript:alert(1)']) {
      const refused = await create({ ...BASE, bodyEn: `See [this](${target})` });
      expect(refused.status).toBe(400);
      expect(fieldsOf(refused)).toMatchObject({ bodyEn: 'not_allowed' });
    }
  });

  it('tells the owner and the staff with notices:read in the bell and push; an info notice sends no email or SMS and charges nothing (NTC-06)', async () => {
    const before = await admin.query<{ balance_amount: string; entries: number }>(
      `SELECT t.balance_amount, (SELECT count(*)::int FROM tenant.balance_ledger l WHERE l.tenant_id = t.id) AS entries
       FROM control.tenants t WHERE t.id = $1`,
      [shop.tenantId],
    );
    const textsBefore = texts.sent.length;
    const id = await published();
    const told = await bellRows(`/notices/${id}`);
    expect(told.map((row) => row.user_id).sort()).toEqual([ownerId, staffId].sort());
    expect(told.map((row) => row.user_id)).not.toContain(bystanderId);
    expect(told[0]?.words.en.title).toBe('From Lytro: A new feature');
    const pushes = await admin.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM control.job_outbox
       WHERE queue_name = 'notification_push' AND payload->>'tenantId' = $1`,
      [shop.tenantId],
    );
    expect(pushes.rows[0]?.count).toBeGreaterThanOrEqual(2);
    expect(await emailsTo(ownerEmail)).toEqual([]);
    expect(texts.sent.length).toBe(textsBefore);
    const after = await admin.query<{ balance_amount: string; entries: number }>(
      `SELECT t.balance_amount, (SELECT count(*)::int FROM tenant.balance_ledger l WHERE l.tenant_id = t.id) AS entries
       FROM control.tenants t WHERE t.id = $1`,
      [shop.tenantId],
    );
    expect(after.rows[0]).toEqual(before.rows[0]);

    // The notice is marked sent; the operator sees where it went.
    const detail = await getJson(port, `/operator/notices/${id}`, operator);
    const notice = detail.body as OperatorNotice;
    expect(notice.status).toBe('live');
    expect(notice.sentAt).not.toBeNull();
    expect(notice.counts.shops).toBeGreaterThanOrEqual(2);
    // A second pass sends nothing more.
    expect((await tick()).notices).toBe(0);
    expect(await bellRows(`/notices/${id}`)).toHaveLength(2);
  });

  it('emails the owner an important notice, whole, in their language (NTC-06, D7-56)', async () => {
    await published({
      severity: 'important',
      titleEn: 'Policy change',
      bodyEn: 'Read **this** at [our page](https://lytro.app/policy).',
    });
    const emails = await emailsTo(ownerEmail);
    expect(emails).toHaveLength(1);
    expect(emails[0]?.subject).toBe('Notice from Lytro: Policy change');
    expect(emails[0]?.body).toContain('Read this at our page (https://lytro.app/policy).');
    expect(emails[0]?.body).toContain('It is also on the Notices page in your dashboard.');
  });

  it('carries on a pass cut short, never telling a shop twice (NTC-06)', async () => {
    const made = await create({ ...BASE, publishAt: new Date(Date.now() - 1000) });
    const id = (made.body as { id: string }).id;
    // As if an earlier pass told this shop and stopped before the rest.
    await admin.query(
      'INSERT INTO control.notice_deliveries (notice_id, tenant_id, people, emailed) VALUES ($1, $2, 2, false)',
      [id, shop.tenantId],
    );
    await tick();
    expect(await bellRows(`/notices/${id}`)).toEqual([]);
    const reached = await admin.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM tenant.notifications WHERE tenant_id = $1 AND link = $2',
      [other.tenantId, `/notices/${id}`],
    );
    expect(reached.rows[0]?.count).toBe(1);
    const sent = await admin.query<{ sent_at: Date | null }>(
      'SELECT sent_at FROM control.notices WHERE id = $1',
      [id],
    );
    expect(sent.rows[0]?.sent_at).not.toBeNull();
    // Two passes at once: the second to reach a shop finds its place already taken, so it tells no one there.
    const store = app.get<NoticeStore>(NOTICE_STORE);
    const claimedAgain = await store.runInShop(other.tenantId, (tx) =>
      store.claimDelivery(tx, id, other.tenantId),
    );
    expect(claimedAgain).toBe(false);
  });

  it('reads the audience when the shop looks: a plan, a state, one shop (NTC-02)', async () => {
    // The shop is on Starter (it took a staff seat); the notice is for shops on the Trial plan.
    const plans = await admin.query<{ id: string; name: string }>(
      "SELECT id, name FROM control.plans WHERE name IN ('Starter', 'Trial')",
    );
    const trial = plans.rows.find((plan) => plan.name === 'Trial')?.id ?? '';
    const starter = plans.rows.find((plan) => plan.name === 'Starter')?.id ?? '';
    const forTrial = await published({
      titleEn: 'For Trial',
      audience: { kind: 'plans', planIds: [trial] },
    });
    expect((await board(shop)).map((item) => item.id)).not.toContain(forTrial);
    await admin.query('UPDATE control.tenants SET plan_id = $2 WHERE id = $1', [
      shop.tenantId,
      trial,
    ]);
    try {
      expect((await board(shop)).map((item) => item.id)).toContain(forTrial);
    } finally {
      await admin.query('UPDATE control.tenants SET plan_id = $2 WHERE id = $1', [
        shop.tenantId,
        starter,
      ]);
    }

    const forOther = await published({ audience: { kind: 'tenant', tenantId: other.tenantId } });
    expect((await board(other)).map((item) => item.id)).toContain(forOther);
    expect((await board(shop)).map((item) => item.id)).not.toContain(forOther);
    for (const path of [`/notices/${forOther}`]) {
      expect((await shop.get(path)).status).toBe(404);
    }
    for (const path of ['read', 'dismiss', 'acknowledge']) {
      expect((await shop.post(`/notices/${forOther}/${path}`, {})).status).toBe(404);
    }

    await admin.query("UPDATE control.tenants SET state = 'active' WHERE id = $1", [shop.tenantId]);
    const forTrials = await published({ audience: { kind: 'states', states: ['trial'] } });
    expect((await board(other)).map((item) => item.id)).toContain(forTrials);
    expect((await board(shop)).map((item) => item.id)).not.toContain(forTrials);

    const unknownPlan = await create({
      ...BASE,
      audience: { kind: 'plans', planIds: [randomUUID()] },
    });
    expect(unknownPlan.status).toBe(400);
    expect(fieldsOf(unknownPlan)).toMatchObject({ 'audience.planIds': 'not_found' });
  });

  it('lists pinned first, then newest, by category and words, and counts what each person has not opened (NTC-03, NTC-09)', async () => {
    const older = await published({ titleEn: 'Older maintenance', category: 'maintenance' });
    const pinned = await published({ titleEn: 'Pinned policy', category: 'policy', pinned: true });
    const newest = await published({ titleEn: 'Newest feature' });
    await admin.query(
      "UPDATE control.notices SET publish_at = now() - interval '3 days' WHERE id = $1",
      [older],
    );
    await admin.query(
      "UPDATE control.notices SET publish_at = now() - interval '2 days' WHERE id = $1",
      [pinned],
    );
    expect((await board(shop)).map((item) => item.id)).toEqual([pinned, newest, older]);
    expect((await board(shop, '?category=maintenance')).map((item) => item.id)).toEqual([older]);
    expect((await board(shop, '?q=Newest', 'en')).map((item) => item.id)).toEqual([newest]);
    expect((await board(shop, '?limit=1')).length).toBe(1);

    expect((await summaryOf(shop.headers())).unread).toBe(3);
    const read = await shop.post(`/notices/${newest}/read`, {});
    expect(read.status, JSON.stringify(read.body)).toBe(200);
    expect((read.body as { unread: number }).unread).toBe(2);
    // Read state is each person's own.
    expect((await summaryOf(staff)).unread).toBe(3);
    expect((await summaryOf(other.headers())).unread).toBe(3);
    const counts = (await getJson(port, `/operator/notices/${newest}`, operator))
      .body as OperatorNotice;
    expect(counts.counts.reads).toBe(1);

    // NTC-03: the board keeps the last 24 months.
    await admin.query(
      "UPDATE control.notices SET publish_at = now() - interval '25 months' WHERE id = $1",
      [older],
    );
    expect((await board(shop)).map((item) => item.id)).toEqual([pinned, newest]);
  });

  it("shows the reader's language, or the other when the notice has none in theirs (NTC-15)", async () => {
    const both = await published();
    const englishOnly = await published({ titleBn: null, bodyBn: null, titleEn: 'Only English' });
    const bangla = await board(shop, '', 'bn');
    expect(bangla.find((item) => item.id === both)).toMatchObject({
      title: 'নতুন ফিচার',
      language: 'bn',
    });
    expect(bangla.find((item) => item.id === englishOnly)).toMatchObject({
      title: 'Only English',
      language: 'en',
    });
    const english = await board(shop, '', 'en');
    expect(english.find((item) => item.id === both)).toMatchObject({
      title: 'A new feature',
      language: 'en',
    });
  });

  it('keeps an urgent banner until closed and an important prompt until seen; info is on the board only (NTC-04)', async () => {
    const urgent = await published({ severity: 'urgent', titleEn: 'Urgent' });
    const important = await published({ severity: 'important', titleEn: 'Important' });
    const info = await published({ titleEn: 'Info' });
    const first = await summaryOf(shop.headers());
    expect(first.banners.map((brief) => brief.id)).toEqual([urgent]);
    expect(first.prompts.map((brief) => brief.id)).toEqual([important]);
    expect([...first.banners, ...first.prompts].map((brief) => brief.id)).not.toContain(info);

    expect((await shop.post(`/notices/${urgent}/dismiss`, {})).status).toBe(200);
    expect((await shop.post(`/notices/${important}/read`, {})).status).toBe(200);
    const after = await summaryOf(shop.headers());
    expect(after.banners).toEqual([]);
    expect(after.prompts).toEqual([]);
    // Closing a banner isn't reading it, and each person closes their own.
    expect(after.unread).toBe(2);
    expect((await summaryOf(staff)).banners.map((brief) => brief.id)).toEqual([urgent]);
  });

  it('counts down to a maintenance window, and says when it is under way (NTC-14)', async () => {
    const starts = new Date(Date.now() + 2 * 3600_000);
    const ends = new Date(Date.now() + 3 * 3600_000);
    const id = await published({
      category: 'maintenance',
      severity: 'important',
      windowStartsAt: starts,
      windowEndsAt: ends,
    });
    const before = await summaryOf(shop.headers());
    expect(before.maintenance).toMatchObject({ id, underWay: false });
    expect(new Date(before.maintenance?.startsAt ?? 0).getTime()).toBe(starts.getTime());
    await admin.query(
      "UPDATE control.notices SET window_starts_at = now() - interval '1 minute' WHERE id = $1",
      [id],
    );
    expect((await summaryOf(shop.headers())).maintenance?.underWay).toBe(true);
    await admin.query(
      "UPDATE control.notices SET window_ends_at = now() - interval '1 second', window_starts_at = now() - interval '1 hour' WHERE id = $1",
      [id],
    );
    expect((await summaryOf(shop.headers())).maintenance).toBeNull();
    const onOther = await create({ ...BASE, windowStartsAt: starts, windowEndsAt: ends });
    expect(onOther.status).toBe(400);
    expect(fieldsOf(onOther)).toMatchObject({ windowStartsAt: 'not_allowed' });
  });

  it('takes the owner\'s "I understand" once, in both logs, and the operator sees who is still to (NTC-05, NTC-17)', async () => {
    const id = await published({
      severity: 'important',
      requiresAck: true,
      titleEn: 'Read and agree',
    });
    expect((await summaryOf(shop.headers())).toAcknowledge.map((brief) => brief.id)).toEqual([id]);
    expect((await summaryOf(staff)).toAcknowledge).toEqual([]);
    const byStaff = await postJson(port, `/notices/${id}/acknowledge`, {}, staff);
    expect(byStaff.status).toBe(403);
    expect(errorOf(byStaff).code).toBe('forbidden');

    const first = await shop.post(`/notices/${id}/acknowledge`, {});
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    const again = await shop.post(`/notices/${id}/acknowledge`, {});
    expect((again.body as { acknowledgedAt: string }).acknowledgedAt).toBe(
      (first.body as { acknowledgedAt: string }).acknowledgedAt,
    );
    expect((await summaryOf(shop.headers())).toAcknowledge).toEqual([]);
    expect((await board(shop)).find((item) => item.id === id)?.read).toBe(true);

    const activity = await admin.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM tenant.activity_log WHERE tenant_id = $1 AND action = 'notice_acknowledged' AND target_id = $2",
      [shop.tenantId, id],
    );
    expect(activity.rows[0]?.count).toBe(1);
    const platform = await admin.query<{ actor_type: string; actor_id: string }>(
      "SELECT actor_type, actor_id FROM control.platform_audit_log WHERE action = 'notice_acknowledged' AND target_id = $1",
      [id],
    );
    expect(platform.rows).toEqual([{ actor_type: 'shop_owner', actor_id: ownerId }]);

    const listed = await getJson(port, `/operator/notices/${id}/acknowledgments`, operator);
    const list = listed.body as {
      acknowledged: { tenantId: string; userId: string }[];
      pending: { tenantId: string }[];
      acknowledgedCount: number;
    };
    expect(list.acknowledged).toEqual([
      expect.objectContaining({ tenantId: shop.tenantId, userId: ownerId }),
    ]);
    expect(list.pending.map((row) => row.tenantId)).toContain(other.tenantId);
    expect(list.pending.map((row) => row.tenantId)).not.toContain(shop.tenantId);
    expect(list.acknowledgedCount).toBe(1);
    // Another shop's own acknowledgment is still to give: one shop's never shows as another's (NTC-18).
    expect((await summaryOf(other.headers())).toAcknowledge.map((brief) => brief.id)).toEqual([id]);

    const plain = await published();
    const refused = await shop.post(`/notices/${plain}/acknowledge`, {});
    expect(refused.status).toBe(409);
  });

  it('NTC-08: withdrawn, it leaves the bell and its badge at once, and a push still waiting never goes', async () => {
    const before = (await shop.get('/notifications')).body as { unread: number };
    const id = await published({ titleEn: 'Pulled back' });
    const told = (await shop.get('/notifications')).body as {
      unread: number;
      items: { link: string }[];
    };
    expect(told.unread).toBe(before.unread + 1);
    expect(told.items.some((item) => item.link === `/notices/${id}`)).toBe(true);
    const { rows } = await admin.query<{ id: string }>(
      'SELECT id FROM tenant.notifications WHERE tenant_id = $1 AND link = $2 LIMIT 1',
      [shop.tenantId, `/notices/${id}`],
    );
    const withdrawn = await postJson(port, `/operator/notices/${id}/withdraw`, {}, operator);
    expect(withdrawn.status, JSON.stringify(withdrawn.body)).toBeLessThan(300);
    const after = (await shop.get('/notifications')).body as {
      unread: number;
      items: { link: string }[];
    };
    expect(after.unread).toBe(before.unread);
    expect(after.items.some((item) => item.link === `/notices/${id}`)).toBe(false);
    const lookedUp = vi.spyOn(app.get<NotificationStore>(NOTIFICATION_STORE), 'subscriptionsOf');
    const pushed = await app
      .get(PushSender)
      .send({ tenantId: shop.tenantId, notificationId: rows[0]?.id as string });
    expect(pushed).toEqual({ sent: 0, gone: 0, failed: 0 });
    expect(lookedUp).not.toHaveBeenCalled();
    lookedUp.mockRestore();
  });

  it('NTC-08: withdrawn while it is going out, the shops not yet reached hear nothing', async () => {
    const made = await create({ ...BASE, publishAt: new Date(Date.now() - 1000) });
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    const { id } = made.body as { id: string };
    const store = app.get<NoticeStore>(NOTICE_STORE);
    const first = await admin.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM control.tenants WHERE deleted_at IS NULL',
    );
    const real = store.findById.bind(store);
    let looked = 0;
    // The operator withdraws it the moment the first shop has been told.
    const spy = vi.spyOn(store, 'findById').mockImplementation(async (noticeId) => {
      looked += 1;
      if (looked === 2) await postJson(port, `/operator/notices/${id}/withdraw`, {}, operator);
      return real(noticeId);
    });
    try {
      await tick();
    } finally {
      spy.mockRestore();
    }
    const delivered = await admin.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM control.notice_deliveries WHERE notice_id = $1',
      [id],
    );
    expect(first.rows[0]?.n).toBeGreaterThan(1);
    expect(delivered.rows[0]?.n).toBe(1);
  });

  it('keeps the earlier version of an edited live notice and sends nothing again; a withdrawn one leaves every board (NTC-08)', async () => {
    const id = await published({ titleEn: 'First words' });
    const edited = await patchJson(
      port,
      `/operator/notices/${id}`,
      { titleEn: 'Second words' },
      operator,
    );
    expect(edited.status, JSON.stringify(edited.body)).toBe(200);
    expect((edited.body as OperatorNotice).editedAt).not.toBeNull();
    const item = (await board(shop, '', 'en')).find((each) => each.id === id);
    expect(item?.title).toBe('Second words');
    expect(item?.editedAt).not.toBeNull();
    const detail = (await getJson(port, `/operator/notices/${id}`, operator)).body as {
      createdByEmail: string | null;
      versions: { snapshot: { titleEn: string }; editedByEmail: string | null }[];
    };
    expect(detail.versions.map((version) => version.snapshot.titleEn)).toEqual(['First words']);
    // Slice 7.7: who wrote it and who replaced each version, as their emails.
    expect(detail.createdByEmail).toBe(operatorEmail);
    expect(detail.versions[0]?.editedByEmail).toBe(operatorEmail);
    await tick();
    expect(await bellRows(`/notices/${id}`)).toHaveLength(2);

    const moved = await patchJson(
      port,
      `/operator/notices/${id}`,
      { publishAt: new Date(Date.now() + 3600_000) },
      operator,
    );
    expect(moved.status).toBe(400);
    expect(fieldsOf(moved)).toMatchObject({ publishAt: 'not_allowed' });
    const broken = await patchJson(
      port,
      `/operator/notices/${id}`,
      { bodyEn: null, bodyBn: null },
      operator,
    );
    expect(broken.status).toBe(400);

    // A draft's edit keeps no version.
    const draft = (await create(BASE)).body as OperatorNotice;
    await patchJson(port, `/operator/notices/${draft.id}`, { titleEn: 'Draft again' }, operator);
    const draftDetail = (await getJson(port, `/operator/notices/${draft.id}`, operator)).body as {
      versions: unknown[];
      editedAt: string | null;
    };
    expect(draftDetail.versions).toEqual([]);
    expect(draftDetail.editedAt).toBeNull();

    const withdrawn = await postJson(port, `/operator/notices/${id}/withdraw`, {}, operator);
    expect(withdrawn.status, JSON.stringify(withdrawn.body)).toBe(200);
    expect((withdrawn.body as OperatorNotice).status).toBe('withdrawn');
    expect((await board(shop)).map((each) => each.id)).not.toContain(id);
    expect((await shop.get(`/notices/${id}`)).status).toBe(404);
    const history = (await getJson(port, '/operator/notices', operator)).body as {
      items: OperatorNotice[];
    };
    expect(history.items.find((each) => each.id === id)?.status).toBe('withdrawn');
    const late = await patchJson(
      port,
      `/operator/notices/${id}`,
      { titleEn: 'Too late' },
      operator,
    );
    expect(late.status).toBe(409);

    const audit = await admin.query<{ action: string }>(
      'SELECT action FROM control.platform_audit_log WHERE target_id = $1 ORDER BY created_at',
      [id],
    );
    expect(audit.rows.map((row) => row.action)).toEqual([
      'notice_created',
      'notice_edited',
      'notice_withdrawn',
    ]);
  });

  it('hides a notice past its end time, and a scheduled one until its time (NTC-11)', async () => {
    const id = await published({ endsAt: new Date(Date.now() + 3600_000) });
    expect((await board(shop)).map((item) => item.id)).toContain(id);
    await admin.query(
      "UPDATE control.notices SET ends_at = now() - interval '1 second' WHERE id = $1",
      [id],
    );
    expect((await board(shop)).map((item) => item.id)).not.toContain(id);
    const later = await create({ ...BASE, publishAt: new Date(Date.now() + 3600_000) });
    expect((later.body as OperatorNotice).status).toBe('scheduled');
    expect((await tick()).notices).toBe(0);
    expect(await board(shop)).toEqual([]);
  });

  it('NTC-07: in a locked shop only the owner is told, since staff could not open it', async () => {
    const before = await admin.query<{ state: string }>(
      'SELECT state FROM control.tenants WHERE id = $1',
      [shop.tenantId],
    );
    await admin.query("UPDATE control.tenants SET state = 'locked' WHERE id = $1", [shop.tenantId]);
    try {
      const id = await published({ titleEn: 'Owner only' });
      expect(await bellRows(`/notices/${id}`)).toHaveLength(1);
    } finally {
      await admin.query('UPDATE control.tenants SET state = $1 WHERE id = $2', [
        before.rows[0]?.state,
        shop.tenantId,
      ]);
    }
  });

  it('lets the owner read the board in a locked shop but not staff, and an archived one urgent notices only (NTC-07)', async () => {
    const info = await published();
    const urgent = await published({ severity: 'urgent', titleEn: 'Urgent' });
    await admin.query("UPDATE control.tenants SET state = 'locked' WHERE id = $1", [shop.tenantId]);
    expect((await board(shop)).map((item) => item.id).sort()).toEqual([info, urgent].sort());
    const asStaff = await getJson(port, '/notices', staff);
    expect(asStaff.status).not.toBe(200);
    await admin.query("UPDATE control.tenants SET state = 'archived' WHERE id = $1", [
      shop.tenantId,
    ]);
    expect((await board(shop)).map((item) => item.id)).toEqual([urgent]);
    expect((await shop.post(`/notices/${info}/read`, {})).status).toBe(404);
    await admin.query("UPDATE control.tenants SET state = 'read_only' WHERE id = $1", [
      shop.tenantId,
    ]);
    expect((await shop.post(`/notices/${info}/read`, {})).status).toBe(200);
  });

  it('counts how many shops an audience reaches before it is saved, an archived shop only for urgent (NTC-02, NTC-07, Slice 7.7)', async () => {
    const reach = async (audience: unknown, severity = 'info'): Promise<number> => {
      const counted = await postJson(
        port,
        '/operator/notices/reach',
        { audience, severity },
        operator,
      );
      expect(counted.status, JSON.stringify(counted.body)).toBe(200);
      return (counted.body as { shops: number }).shops;
    };
    expect(await reach({ kind: 'tenant', tenantId: other.tenantId })).toBe(1);
    expect(await reach({ kind: 'all' })).toBeGreaterThanOrEqual(2);
    expect(await reach({ kind: 'states', states: ['trial'] })).toBeGreaterThanOrEqual(1);
    await admin.query("UPDATE control.tenants SET state = 'archived' WHERE id = $1", [
      other.tenantId,
    ]);
    expect(await reach({ kind: 'tenant', tenantId: other.tenantId })).toBe(0);
    expect(await reach({ kind: 'tenant', tenantId: other.tenantId }, 'urgent')).toBe(1);
    const unknown = await postJson(
      port,
      '/operator/notices/reach',
      { audience: { kind: 'plans', planIds: [randomUUID()] }, severity: 'info' },
      operator,
    );
    expect(unknown.status).toBe(400);
    expect([401, 403]).toContain(
      (
        await postJson(
          port,
          '/operator/notices/reach',
          { audience: { kind: 'all' }, severity: 'info' },
          shop.headers(),
        )
      ).status,
    );
  });

  it('keeps writing notices to the operator: no shop credential reaches the desk (NTC-10)', async () => {
    const asOwner = await postJson(port, '/operator/notices', BASE, shop.headers());
    expect([401, 403]).toContain(asOwner.status);
    const listAsOwner = await getJson(port, '/operator/notices', shop.headers());
    expect([401, 403]).toContain(listAsOwner.status);
    const id = await published({ titleEn: 'Not for shops to change' });
    const asShop = [
      await patchJson(port, `/operator/notices/${id}`, { titleEn: 'x' }, shop.headers()),
      await postJson(port, `/operator/notices/${id}/withdraw`, {}, shop.headers()),
      await getJson(port, `/operator/notices/${id}`, shop.headers()),
    ];
    expect(asShop.every((answer) => [401, 403].includes(answer.status))).toBe(true);
    // NTC-10: and a person without the notices permission can't read the board.
    const without = await staffWith(port, texts, admin, other, [Permission.OrdersRead]);
    expect((await getJson(port, '/notices', without)).status).toBe(403);
  });

  it('fills a rate change from the change itself, and publishing it links the two (NTC-12, NTC-13, RAT-09)', async () => {
    const changed = await patchJson(
      port,
      `/operator/rates/${RateKey.SmsPerUnit}`,
      { value: 0.61, reason: 'Our SMS provider raised its price' },
      operator,
    );
    expect(changed.status, JSON.stringify(changed.body)).toBe(200);
    const history = await admin.query<{ id: string; old_value: string | null }>(
      'SELECT id::text, old_value FROM control.rate_history WHERE key = $1 ORDER BY id DESC LIMIT 1',
      [RateKey.SmsPerUnit],
    );
    const rateChangeId = Number(history.rows[0]?.id);
    // Slice 7.7: saving the rate answers the change's id, and recent changes carry it.
    expect((changed.body as { ok: boolean; id: number }).id).toBe(rateChangeId);
    const recent = await getJson(port, '/operator/recent-changes', operator);
    const rows = recent.body as { key: string | null; rateChangeId: number | null }[];
    expect(rows.find((row) => row.key === RateKey.SmsPerUnit)?.rateChangeId).toBe(rateChangeId);
    const filled = await postJson(
      port,
      '/operator/notices/template',
      { template: 'rate_change', variables: { rateChangeId } },
      operator,
    );
    expect(filled.status, JSON.stringify(filled.body)).toBe(200);
    const draft = filled.body as {
      titleEn: string;
      bodyEn: string;
      category: string;
      rateChangeId: number;
      titleBn: string;
      bodyBn: string;
      severity: string;
    };
    expect(draft.titleEn).toContain('SMS, per part rate');
    expect(draft.titleEn).toContain('৳0.61');
    expect(draft.category).toBe('rate_change');
    expect(draft.rateChangeId).toBe(rateChangeId);

    const id = await published({
      titleBn: draft.titleBn,
      bodyBn: draft.bodyBn,
      titleEn: draft.titleEn,
      bodyEn: draft.bodyEn,
      category: draft.category,
      severity: draft.severity,
      rateChangeId,
    });
    const linked = await admin.query<{ notice_id: string | null }>(
      'SELECT notice_id FROM control.rate_history WHERE id = $1',
      [rateChangeId],
    );
    expect(linked.rows[0]?.notice_id).toBe(id);

    const maintenance = await postJson(
      port,
      '/operator/notices/template',
      {
        template: 'maintenance',
        variables: {
          windowStartsAt: '2026-11-24T20:00:00Z',
          windowEndsAt: '2026-11-24T21:00:00Z',
        },
      },
      operator,
    );
    expect((maintenance.body as { titleEn: string }).titleEn).toBe(
      'Maintenance 25 Nov, 2 am to 3 am',
    );
    const policy = await postJson(
      port,
      '/operator/notices/template',
      { template: 'policy_update' },
      operator,
    );
    expect((policy.body as { requiresAck: boolean }).requiresAck).toBe(true);
    const missing = await postJson(
      port,
      '/operator/notices/template',
      { template: 'rate_change', variables: { rateChangeId: 999_999_999 } },
      operator,
    );
    expect(missing.status).toBe(400);
  });
});
