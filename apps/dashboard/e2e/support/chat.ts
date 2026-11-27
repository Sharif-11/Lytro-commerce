import { ChatSenderKind, type ChatMessageView, type ChatView } from '@lytronix/validators';

// LIVE-CHAT-PLAN (PR 1): the shop's chat with Lytro as the server answers it, for the `lc-*` states. The socket never
// connects in a test, so the dashboard reads over HTTPS (LC-3's fallback), as a browser that can't open one would.

const HOUR_MS = 60 * 60 * 1000;
/** Where a chat photo's signed link points in a test; the mock answers it. */
export const CHAT_UPLOAD_PATH = '/__upload/chat-photo';

/** A message as the server writes it, `hoursAgo` before now. */
export function chatMessage(
  id: string,
  senderKind: ChatSenderKind,
  body: string,
  hoursAgo: number,
  more: Partial<ChatMessageView> = {},
): ChatMessageView {
  return {
    id,
    senderKind,
    senderName: senderKind === ChatSenderKind.Lytro ? null : 'রুমানা',
    systemKind: null,
    body,
    photos: [],
    createdAt: new Date(Date.now() - hoursAgo * HOUR_MS).toISOString(),
    ...more,
  };
}

/** The drawn chat (`lc-chat`): switched on, open hours, one question and Lytro's answer, nothing unread. */
export function drawnChat(more: Partial<ChatView> = {}): ChatView {
  return {
    enabled: true,
    unread: 0,
    historyDays: 7,
    hours: { opensHour: 9, closesHour: 22, open: true },
    whatsapp: '01711223344',
    messages: [
      chatMessage('m-1', ChatSenderKind.Owner, 'পেমেন্ট পেজে bKash দেখাচ্ছে না কেন?', 20),
      chatMessage('m-2', ChatSenderKind.Lytro, 'মেনু → পেমেন্ট মেথডে bKash চালু করলেই দেখাবে।', 19),
    ],
    ...more,
  };
}

/** GET /chat and its writes, answered from `chat`, which the writes change. Null when the path isn't the chat's. */
export function chatAnswer(
  chat: ChatView,
  method: string,
  path: string,
  body: Record<string, unknown> | null,
): unknown {
  if (method === 'GET' && path === '/chat') return chat;
  if (method === 'POST' && path === '/chat/read') {
    chat.unread = 0;
    return { unread: 0 };
  }
  if (method === 'POST' && path === '/chat/photos') {
    return {
      key: `chat/e2e/${String(chat.messages.length)}`,
      upload: {
        url: `${CHAT_UPLOAD_PATH}?n=${String(chat.messages.length)}`,
        method: 'PUT',
        headers: { 'Content-Type': 'image/png' },
        expiresAt: new Date(Date.now() + HOUR_MS).toISOString(),
      },
    };
  }
  if (method === 'POST' && path === '/chat/messages') {
    const keys = Array.isArray(body?.['photoKeys']) ? (body['photoKeys'] as unknown[]) : [];
    const message = chatMessage(
      `m-${String(chat.messages.length + 1)}`,
      ChatSenderKind.Owner,
      typeof body?.['body'] === 'string' ? body['body'] : '',
      0,
      { photos: keys.map((_, at) => ({ id: `p-${String(at)}`, removed: false })) },
    );
    chat.messages.push(message);
    return message;
  }
  return null;
}
