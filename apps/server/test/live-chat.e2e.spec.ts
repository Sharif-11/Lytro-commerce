import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from 'bcryptjs';
import { generate } from 'otplib';
import pg from 'pg';
import { io, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { CHAT_SOCKET_PATH, ChatSocketEvent, ChatSystemKind } from '@lytronix/validators';
import { AppModule } from '../src/app/app.module';
import { MEDIA_STORAGE } from '../src/modules/media/tokens';
import { ChatBus, type ChatEvent } from '../src/modules/live-chat/services/chat-bus';
import { openAt } from '../src/modules/live-chat/services/chat-settings';
import { LiveChat, lastClosingBefore } from '../src/modules/live-chat/services/live-chat';
import { CHAT_CLOCK } from '../src/modules/live-chat/tokens';
import { connectRedis } from '../src/modules/shared/redis/redis-connection';
import { ChatTickWorker } from '../src/modules/shared/queue-workers/services/chat-tick-worker';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';
import { cookieFrom, deleteJson, getJson, patchJson, postJson, putJson } from './support/http';
import { MemoryStorage } from './support/memory-storage';
import { openShop, type ShopClient } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';

const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const REDIS_URL = process.env['REDIS_TEST_URL'];
const DB_NAME = 'lytronix_live_chat_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;
const describeIfRedis = REDIS_URL ? describe : describe.skip;
vi.setConfig({ testTimeout: 60_000 });

// A PNG's own first bytes are what the server checks (LC-8).
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(64, 1),
]);
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

describe('the chat hours (LC-24)', () => {
  it('opens and closes by the help line hours in Dhaka, across midnight too', () => {
    // 06:00 UTC is noon in Dhaka; 17:00 UTC is 11 pm.
    expect(openAt(new Date('2026-11-27T06:00:00Z'), 9, 22)).toBe(true);
    expect(openAt(new Date('2026-11-27T17:00:00Z'), 9, 22)).toBe(false);
    expect(openAt(new Date('2026-11-27T17:00:00Z'), 20, 2)).toBe(true);
    expect(openAt(new Date('2026-11-27T06:00:00Z'), 20, 2)).toBe(false);
  });

  it('finds the last closing before a moment: tonight once past it, else last night', () => {
    // 22:00 Dhaka is 16:00 UTC.
    expect(lastClosingBefore(new Date('2026-11-27T17:00:00Z'), 22).toISOString()).toBe(
      '2026-11-27T16:00:00.000Z',
    );
    expect(lastClosingBefore(new Date('2026-11-27T02:00:00Z'), 22).toISOString()).toBe(
      '2026-11-26T16:00:00.000Z',
    );
  });
});

describeIfRedis('the fan-out across processes (LC-3, §6)', () => {
  it('hands an event published by one process to another through the one Redis channel', async () => {
    const one = connectRedis(REDIS_URL ?? '', 'chat-one');
    const two = connectRedis(REDIS_URL ?? '', 'chat-two');
    const publisher = new ChatBus(one);
    const listener = new ChatBus(two);
    const heard: ChatEvent[] = [];
    listener.listen((event) => heard.push(event));
    await vi.waitFor(
      () => {
        expect(two.status).toBe('ready');
      },
      { timeout: 5_000 },
    );
    // The subscriber's own connection subscribes as it comes up.
    await new Promise((resolve) => setTimeout(resolve, 300));
    await publisher.publish({ type: 'closed', tenantId: 'fan-out' });
    await vi.waitFor(
      () => {
        expect(heard).toEqual([{ type: 'closed', tenantId: 'fan-out' }]);
      },
      {
        timeout: 5_000,
      },
    );
    listener.onModuleDestroy();
    one.disconnect();
    two.disconnect();
  });
});

let app: INestApplication;
let port: number;
let admin: pg.Client;
let operator: Record<string, string> = {};
const texts = new SmsCapture();
const storage = new MemoryStorage();
// The chat's own clock: noon in Dhaka today, so the busy line's hours are open; the tests move it.
const noon = new Date();
noon.setUTCHours(6, 0, 0, 0);
let now = noon;

async function operatorHeaders(): Promise<Record<string, string>> {
  const password = 'chat-operator-9';
  const email = `operator.${randomUUID().slice(0, 8)}@lytronix.internal`;
  await admin.query(
    'INSERT INTO control.operator_accounts (email, password_hash) VALUES ($1, $2)',
    [email, await hash(password, 12)],
  );
  const signedIn = await postJson(port, '/auth/operator/signin', { email, password });
  const code = await generate({ secret: (signedIn.body as { secret: string }).secret });
  const enrolled = await postJson(port, '/auth/operator/enroll', { email, password, code });
  return {
    cookie: cookieFrom(enrolled),
    'x-csrf-token': (enrolled.body as { csrfToken: string }).csrfToken,
  };
}

/** A photo the way a browser sends it: start, PUT to the signed link, then its key with the message. */
async function uploaded(start: Promise<{ status: number; body: unknown }>): Promise<string> {
  const answer = await start;
  expect(answer.status, JSON.stringify(answer.body)).toBe(201);
  const { key, upload } = answer.body as { key: string; upload: { url: string } };
  expect(storage.send(upload.url, PNG, 'image/png')).toBe(200);
  return key;
}

function socketOf(headers: Record<string, string>, auth: Record<string, string>): Socket {
  return io(`http://127.0.0.1:${String(port)}`, {
    path: CHAT_SOCKET_PATH,
    transports: ['websocket'],
    extraHeaders: { cookie: headers['cookie'] ?? '' },
    auth,
    reconnection: false,
  });
}

function connected(socket: Socket): Promise<'connected' | 'refused'> {
  return new Promise((resolve) => {
    socket.once('connect', () => {
      resolve('connected');
    });
    socket.once('connect_error', () => {
      resolve('refused');
    });
  });
}

describeIfDatabase('live chat over the real stack (LIVE-CHAT-PLAN, PR 1)', () => {
  let shop: ShopClient;
  let other: ShopClient;

  beforeAll(async () => {
    if (!ADMIN_URL) return;
    const urls = await prepareTestDatabase(ADMIN_URL, DB_NAME);
    process.env['DATABASE_URL'] = urls.appDbUrl;
    process.env['OTP_SECRET'] = 'chat-e2e-otp-secret-0123456789abcdef';
    process.env['PLATFORM_DOMAIN'] = 'localhost';
    admin = new pg.Client({ connectionString: urls.adminDbUrl });
    await admin.connect();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(SMS_PROVIDER)
      .useValue(texts.provider)
      .overrideProvider(MEDIA_STORAGE)
      .useValue(storage)
      .overrideProvider(CHAT_CLOCK)
      .useValue(() => now)
      // The spec runs each pass itself, so the minute cron never races it.
      .overrideProvider(ChatTickWorker)
      .useValue({})
      .compile();
    ({ app, port } = await listenOn(moduleRef));
    operator = await operatorHeaders();
    shop = await openShop(port, texts, 'chat');
    other = await openShop(port, texts, 'chat');
  });

  afterAll(async () => {
    if (!ADMIN_URL) return;
    await app.close();
    await admin.end();
  });

  it('is off until a plan or the shop has it: no messages, and writing is refused', async () => {
    const view = await shop.get('/chat');
    expect(view.status).toBe(200);
    expect(view.body).toMatchObject({ enabled: false, messages: [], historyDays: 7 });
    const sent = await shop.post('/chat/messages', { body: 'hello' });
    expect(sent.status).toBe(403);
    expect((sent.body as { code: string }).code).toBe('plan_feature_unavailable');
  });

  it("the operator turns it on for one shop, and the change is in Lytro's audit log (LC-2)", async () => {
    const set = await putJson(
      port,
      `/operator/chats/${shop.tenantId}/feature`,
      { mode: 'on' },
      operator,
    );
    expect(set.status, JSON.stringify(set.body)).toBe(200);
    expect(set.body).toMatchObject({ plan: false, mode: 'on', on: true });
    const audit = await admin.query<{ summary: unknown }>(
      "SELECT summary FROM control.platform_audit_log WHERE action = 'shop_feature_set' AND target_id = $1",
      [shop.tenantId],
    );
    expect(audit.rows[0]?.summary).toMatchObject({ feature: 'live_chat', from: 'plan', to: 'on' });
    expect((await other.get('/chat')).body).toMatchObject({ enabled: false });
  });

  it('a shop writes with a photo; Lytro sees it waiting in the inbox with its context (LC-1, LC-8, LC-9)', async () => {
    const key = await uploaded(
      shop.post('/chat/photos', { contentType: 'image/png', bytes: PNG.length }),
    );
    const sent = await shop.post('/chat/messages', {
      body: 'The courier label cuts off the address.',
      photoKeys: [key],
      page: '/orders/261127-0012',
    });
    expect(sent.status, JSON.stringify(sent.body)).toBe(201);
    expect(sent.body).toMatchObject({
      senderKind: 'owner',
      body: 'The courier label cuts off the address.',
    });

    const waiting = await getJson(port, '/operator/chats/waiting', operator);
    expect(waiting.body).toMatchObject({ waiting: 1, latestTenantId: shop.tenantId });
    const inbox = await getJson(port, '/operator/chats', operator);
    const row = (inbox.body as { items: { tenantId: string; unread: number }[] }).items.find(
      (each) => each.tenantId === shop.tenantId,
    );
    expect(row).toMatchObject({ unread: 1 });

    const detail = await getJson(port, `/operator/chats/${shop.tenantId}`, operator);
    expect(detail.status).toBe(200);
    expect(detail.body).toMatchObject({
      shop: { tenantId: shop.tenantId, slug: shop.slug },
      lastPage: '/orders/261127-0012',
      feature: { on: true },
    });
    const messages = (detail.body as { messages: { photos: { id: string }[] }[] }).messages;
    const photoId = messages.at(-1)?.photos[0]?.id ?? '';
    const photo = await getJson(port, `/operator/chat/photos/${photoId}`, operator);
    expect(photo.status).toBe(200);
    // The shop's own photo through its own route; another shop asking for it is told it isn't there (TEN-03).
    expect((await shop.get(`/chat/photos/${photoId}`)).status).toBe(200);
    expect((await other.get(`/chat/photos/${photoId}`)).status).toBe(404);
  });

  it("refuses another shop's upload key, and a message with neither words nor photos", async () => {
    await putJson(port, `/operator/chats/${other.tenantId}/feature`, { mode: 'on' }, operator);
    const theirs = await uploaded(
      other.post('/chat/photos', { contentType: 'image/png', bytes: PNG.length }),
    );
    const stolen = await shop.post('/chat/messages', { body: '', photoKeys: [theirs] });
    expect(stolen.status).toBe(400);
    const empty = await shop.post('/chat/messages', { body: '   ' });
    expect(empty.status).toBe(400);
    await putJson(port, `/operator/chats/${other.tenantId}/feature`, { mode: 'plan' }, operator);
  });

  it("Lytro answers; the shop's people see it unread until they read it (LC-13)", async () => {
    const reply = await postJson(
      port,
      `/operator/chats/${shop.tenantId}/messages`,
      { body: 'Choose A6 paper when printing labels.' },
      operator,
    );
    expect(reply.status, JSON.stringify(reply.body)).toBe(201);
    const view = await shop.get('/chat');
    expect(view.body).toMatchObject({ enabled: true, unread: 1 });
    expect((await getJson(port, '/operator/chats/waiting', operator)).body).toMatchObject({
      waiting: 0,
    });
    expect((await shop.post('/chat/read', {})).body).toMatchObject({ unread: 0 });
    expect((await shop.get('/chat')).body).toMatchObject({ unread: 0 });
    // Another shop never sees this chat.
    expect((await other.get('/chat')).body).toMatchObject({ enabled: false, messages: [] });
  });

  it('sends the busy line once a chat has waited 10 minutes within hours, never twice (LC-5)', async () => {
    now = noon;
    await shop.post('/chat/messages', { body: 'Are you there?' });
    const chat = app.get(LiveChat);
    now = new Date(noon.getTime() + 5 * MINUTE);
    expect(await chat.tick()).toBe(0);
    now = new Date(noon.getTime() + 11 * MINUTE);
    expect(await chat.tick()).toBe(1);
    expect(await chat.tick()).toBe(0);
    const messages = (await shop.get('/chat')).body as {
      messages: { systemKind: string | null }[];
    };
    expect(
      messages.messages.filter((each) => each.systemKind === ChatSystemKind.Busy),
    ).toHaveLength(1);
    now = noon;
  });

  it('answers outside hours once per closed stretch (LC-24)', async () => {
    // 11 pm in Dhaka.
    const late = new Date(noon.getTime() + 11 * 60 * MINUTE);
    now = late;
    await postJson(
      port,
      `/operator/chats/${shop.tenantId}/messages`,
      { body: 'Good night.' },
      operator,
    );
    await shop.post('/chat/messages', { body: 'One more thing.' });
    now = new Date(late.getTime() + 10 * MINUTE);
    await shop.post('/chat/messages', { body: 'And another.' });
    const messages = (await shop.get('/chat')).body as {
      messages: { systemKind: string | null }[];
    };
    expect(
      messages.messages.filter((each) => each.systemKind === ChatSystemKind.OffHours),
    ).toHaveLength(1);
    expect((await shop.get('/chat')).body).toMatchObject({ hours: { open: false, opensHour: 9 } });
    now = noon;
  });

  it('holds a person to the messages a minute the console allows (LC-25)', async () => {
    const changed = await patchJson(
      port,
      '/operator/settings/chat_messages_per_minute',
      { value: 2 },
      operator,
    );
    expect(changed.status, JSON.stringify(changed.body)).toBe(200);
    now = new Date(noon.getTime() + 2 * DAY);
    expect((await shop.post('/chat/messages', { body: 'one' })).status).toBe(201);
    expect((await shop.post('/chat/messages', { body: 'two' })).status).toBe(201);
    const third = await shop.post('/chat/messages', { body: 'three' });
    expect(third.status).toBe(429);
    await patchJson(port, '/operator/settings/chat_messages_per_minute', { value: 20 }, operator);
    now = noon;
  });

  it('keeps quick replies in the order Lytro puts them (LC-10)', async () => {
    const first = await postJson(
      port,
      '/operator/chat/quick-replies',
      { title: 'Label paper', body: 'Choose A6.' },
      operator,
    );
    const second = await postJson(
      port,
      '/operator/chat/quick-replies',
      { title: 'bKash', body: 'Turn it on.' },
      operator,
    );
    expect(first.status).toBe(201);
    const ids = [(second.body as { id: string }).id, (first.body as { id: string }).id];
    expect(
      (await putJson(port, '/operator/chat/quick-replies/order', { ids }, operator)).status,
    ).toBe(200);
    const listed = await getJson(port, '/operator/chat/quick-replies', operator);
    expect((listed.body as { items: { title: string }[] }).items.map((each) => each.title)).toEqual(
      ['bKash', 'Label paper'],
    );
    expect(
      (await deleteJson(port, `/operator/chat/quick-replies/${ids[0] ?? ''}`, operator)).status,
    ).toBe(200);
    expect((await getJson(port, '/operator/chat/quick-replies', { cookie: 'nope' })).status).toBe(
      401,
    );
  });

  it('tells a shop socket of an answer and a Lytro socket of a message, and refuses a stranger (LC-3)', async () => {
    const shopSocket = socketOf(shop.headers(), { side: 'shop', shop: shop.slug });
    const lytroSocket = socketOf(operator, { side: 'lytro' });
    const stranger = socketOf(
      { cookie: 'lytronix_session=nothing' },
      { side: 'shop', shop: shop.slug },
    );
    const offShop = socketOf(other.headers(), { side: 'shop', shop: other.slug });
    expect(await connected(shopSocket)).toBe('connected');
    expect(await connected(lytroSocket)).toBe('connected');
    expect(await connected(stranger)).toBe('refused');
    // The other shop has no chat: no socket either.
    expect(await connected(offShop)).toBe('refused');

    const toShop = new Promise<{ body: string }>((resolve) => {
      shopSocket.once(ChatSocketEvent.Message, resolve);
    });
    await postJson(
      port,
      `/operator/chats/${shop.tenantId}/messages`,
      { body: 'Live now.' },
      operator,
    );
    expect((await toShop).body).toBe('Live now.');

    const toLytro = new Promise<{ body: string; tenantId: string }>((resolve) => {
      lytroSocket.once(ChatSocketEvent.Message, resolve);
    });
    now = new Date(noon.getTime() + 3 * DAY);
    await shop.post('/chat/messages', { body: 'Got it.' });
    expect(await toLytro).toMatchObject({ body: 'Got it.', tenantId: shop.tenantId });

    // LC-2, §4: switched off, the shop's open chat closes at once.
    const closed = new Promise<void>((resolve) => {
      shopSocket.once(ChatSocketEvent.Closed, () => {
        resolve();
      });
    });
    await putJson(port, `/operator/chats/${shop.tenantId}/feature`, { mode: 'off' }, operator);
    await closed;
    await vi.waitFor(() => {
      expect(shopSocket.connected).toBe(false);
    });
    lytroSocket.disconnect();
    stranger.disconnect();
    offShop.disconnect();
    now = noon;
  });

  it("follows the shop's plan once its own setting goes back to the plan (LC-2)", async () => {
    await putJson(port, `/operator/chats/${shop.tenantId}/feature`, { mode: 'plan' }, operator);
    expect((await shop.get('/chat')).body).toMatchObject({ enabled: false });
    await admin.query(
      `UPDATE control.plans SET features = features || '{"live_chat": true}'::jsonb
       WHERE id = (SELECT plan_id FROM control.tenants WHERE id = $1)`,
      [shop.tenantId],
    );
    expect((await shop.get('/chat')).body).toMatchObject({ enabled: true });
    const state = await getJson(port, `/operator/chats/${shop.tenantId}/feature`, operator);
    expect(state.body).toMatchObject({ plan: true, mode: 'plan', on: true });
  });

  it('deletes photos after their days and messages after theirs, each night (LC-8, LC-11)', async () => {
    const chat = app.get(LiveChat);
    now = new Date(noon.getTime() + 4 * DAY);
    const photos = await chat.purge();
    expect(photos.photos).toBeGreaterThan(0);
    expect(storage.evidence.size).toBe(0);
    const marked = await admin.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM control.chat_photos WHERE removed_at IS NULL',
    );
    expect(marked.rows[0]?.n).toBe(0);
    now = new Date(noon.getTime() + 9 * DAY);
    const removed = await chat.purge();
    expect(removed.messages).toBeGreaterThan(0);
    const left = await admin.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM control.chat_messages',
    );
    expect(left.rows[0]?.n).toBe(0);
    now = noon;
  });
});
