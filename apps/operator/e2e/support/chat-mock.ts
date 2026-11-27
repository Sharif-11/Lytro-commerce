import {
  ChatFeatureMode,
  ChatSenderKind,
  type ChatInboxItem,
  type ChatMessageView,
  type ChatWaitingSummary,
} from '@lytronix/validators';
import { RAHIM } from './console-data';

// LIVE-CHAT-PLAN (PR 1, the sketch's `oc-*`): Lytro's side of the chats as the server answers it. The socket never
// connects in a test, so the console reads over HTTPS every few seconds (LC-3's fallback).

// Rahim Fashion, as the shops' own fixtures name it, so its shop page opens too.
export { RAHIM };
const HOUR_MS = 60 * 60 * 1000;

const ago = (hours: number): string => new Date(Date.now() - hours * HOUR_MS).toISOString();
const text = (value: unknown): string => (typeof value === 'string' ? value : '');

function message(
  id: string,
  senderKind: ChatSenderKind,
  senderName: string | null,
  body: string,
  hours: number,
): ChatMessageView {
  return { id, senderKind, senderName, systemKind: null, body, photos: [], createdAt: ago(hours) };
}

export interface ChatMockState {
  inbox: ChatInboxItem[];
  messages: ChatMessageView[];
  /** The shop's own setting and its plan's, which the shop page's card changes. */
  feature: { plan: boolean; mode: ChatFeatureMode };
  quick: { id: string; title: string; body: string }[];
}

/** The drawn inbox (`oc-inbox`): Rahim Fashion waits with two messages, an owner's and a staff member's. */
export function drawnChats(): ChatMockState {
  return {
    inbox: [
      {
        tenantId: RAHIM,
        shopName: 'Rahim Fashion',
        slug: 'rahim-fashion',
        planName: 'Growth',
        lastPreview: 'কুরিয়ার লেবেলে ঠিকানা কেটে যাচ্ছে। একটু দেখবেন?',
        lastSenderKind: ChatSenderKind.Owner,
        lastMessageAt: ago(0.07),
        waitingSince: ago(0.07),
        unread: 2,
      },
    ],
    messages: [
      message('m-1', ChatSenderKind.Staff, 'সুমি', 'পেমেন্ট পেজে bKash দেখাচ্ছে না কেন?', 20),
      message(
        'm-2',
        ChatSenderKind.Lytro,
        null,
        'মেনু → পেমেন্ট মেথডে bKash চালু করলেই দেখাবে।',
        19,
      ),
      message(
        'm-3',
        ChatSenderKind.Owner,
        'রহিম',
        'কুরিয়ার লেবেলে ঠিকানা কেটে যাচ্ছে। একটু দেখবেন?',
        0.07,
      ),
    ],
    feature: { plan: true, mode: ChatFeatureMode.Plan },
    quick: [
      {
        id: 'q-1',
        title: 'লেবেলের কাগজ',
        body: 'লেবেল প্রিন্টের সময় কাগজ A6 বেছে নিন, পুরো ঠিকানা আসবে।',
      },
      { id: 'q-2', title: 'পেজে bKash', body: 'মেনু → পেমেন্ট মেথডে bKash চালু করুন।' },
    ],
  };
}

function waiting(state: ChatMockState): ChatWaitingSummary {
  const open = state.inbox.filter((each) => each.waitingSince !== null);
  return {
    waiting: open.length,
    latestShop: open[0]?.shopName ?? null,
    latestTenantId: open[0]?.tenantId ?? null,
  };
}

function featureState(state: ChatMockState): { plan: boolean; mode: ChatFeatureMode; on: boolean } {
  const on =
    state.feature.mode === ChatFeatureMode.Plan
      ? state.feature.plan
      : state.feature.mode === ChatFeatureMode.On;
  return { ...state.feature, on };
}

/** What a chat route answers, from `state`, which the writes change; undefined when the path isn't a chat's. */
export function chatAnswer(
  state: ChatMockState,
  method: string,
  path: string,
  body: Record<string, unknown> | null,
): unknown {
  if (method === 'GET' && path === '/operator/chats') return { items: state.inbox };
  if (method === 'GET' && path === '/operator/chats/waiting') return waiting(state);
  if (method === 'GET' && path === '/operator/chat/push/key') return { publicKey: null };
  if (path === '/operator/chat/quick-replies') {
    if (method === 'GET') return { items: state.quick };
    const made = {
      id: `q-${String(state.quick.length + 1)}`,
      title: text(body?.['title']),
      body: text(body?.['body']),
    };
    state.quick.push(made);
    return made;
  }
  if (method === 'PUT' && path === '/operator/chat/quick-replies/order') {
    const ids = (body?.['ids'] ?? []) as string[];
    state.quick = ids.flatMap((id) => state.quick.filter((each) => each.id === id));
    return { ok: true };
  }
  const quick = /^\/operator\/chat\/quick-replies\/([^/]+)$/.exec(path);
  if (quick) {
    if (method === 'DELETE') {
      state.quick = state.quick.filter((each) => each.id !== quick[1]);
      return { ok: true };
    }
    const found = state.quick.find((each) => each.id === quick[1]);
    if (found) Object.assign(found, { title: body?.['title'], body: body?.['body'] });
    return found;
  }
  const feature = /^\/operator\/chats\/([^/]+)\/feature$/.exec(path);
  if (feature) {
    if (method === 'PUT') state.feature.mode = body?.['mode'] as ChatFeatureMode;
    return featureState(state);
  }
  const read = /^\/operator\/chats\/([^/]+)\/read$/.exec(path);
  if (read && method === 'POST') {
    for (const each of state.inbox) if (each.tenantId === read[1]) each.unread = 0;
    return { unread: 0 };
  }
  const reply = /^\/operator\/chats\/([^/]+)\/messages$/.exec(path);
  if (reply && method === 'POST') {
    const made = message(
      `m-${String(state.messages.length + 1)}`,
      ChatSenderKind.Lytro,
      null,
      text(body?.['body']),
      0,
    );
    state.messages.push(made);
    for (const each of state.inbox) if (each.tenantId === reply[1]) each.waitingSince = null;
    return made;
  }
  const one = /^\/operator\/chats\/([^/]+)$/.exec(path);
  if (one && method === 'GET') {
    const row = state.inbox.find((each) => each.tenantId === one[1]);
    if (!row) return undefined;
    return {
      shop: {
        tenantId: row.tenantId,
        shopName: row.shopName,
        slug: row.slug,
        state: 'active',
        suspended: false,
        planName: row.planName,
        periodEnd: '2027-01-12T00:00:00.000Z',
        balance: '412.50',
      },
      feature: featureState(state),
      messages: state.messages,
      lastPage: '/orders/261127-0012',
      errors: [{ status: 502, method: 'POST', route: '/couriers/bookings', createdAt: ago(1) }],
      people: [
        { id: 'u-owner', name: 'রহিম', owner: true },
        { id: 'u-staff', name: 'সুমি', owner: false },
      ],
      historyDays: 7,
    };
  }
  return undefined;
}
