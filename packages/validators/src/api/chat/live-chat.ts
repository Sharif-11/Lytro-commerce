import { z } from 'zod';
import { FieldProblemCode } from '../../validation/field-problem';

// LIVE-CHAT-PLAN (the owner, 2026-11-27): live chat between a shop's owner and staff and Lytro, PR 1 without the AI.
// Every shape and limit the server, the dashboard and the console share is written here once.

/** Who wrote a message: one of the shop's people (owner or staff, LC-6), Lytro, or Lytro's automatic line. */
export enum ChatSenderKind {
  Owner = 'owner',
  Staff = 'staff',
  Lytro = 'lytro',
  System = 'system',
}

/** LC-5, LC-24: Lytro's automatic lines. The dashboard writes their words, in the reader's language. */
export enum ChatSystemKind {
  Busy = 'busy',
  OffHours = 'off_hours',
}

/** LC-13: whose read mark a row is -- a shop person's, or one of Lytro's people's. */
export enum ChatReaderKind {
  Shop = 'shop',
  Lytro = 'lytro',
}

/** LC-2: a shop's own setting for the chat: follow its plan, or on or off whatever the plan says. */
export enum ChatFeatureMode {
  Plan = 'plan',
  On = 'on',
  Off = 'off',
}

/** LC-2: the plan feature (and a shop's override key) that gives a shop the chat. */
export const LIVE_CHAT_FEATURE = 'live_chat';

export const CHAT_BODY_MAX = 2000;
/** The dashboard path a seller was on, for Lytro's context panel. */
export const CHAT_PAGE_MAX = 200;
/** LC-8: photos a message may carry. */
export const CHAT_PHOTOS_MAX = 3;
export const CHAT_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const CHAT_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const CHAT_QUICK_REPLY_TITLE_MAX = 60;
export const CHAT_QUICK_REPLY_BODY_MAX = 1000;
export const CHAT_QUICK_REPLIES_MAX = 50;
/** A page of messages: a week of a busy shop's chat fits in one. */
export const CHAT_MESSAGES_PAGE = 300;

// The console's settings (LC-5, LC-8, LC-11, LC-25), until the operator changes them.
export const DEFAULT_CHAT_BUSY_MINUTES = 10;
export const DEFAULT_CHAT_HISTORY_DAYS = 7;
export const DEFAULT_CHAT_PHOTO_DAYS = 3;
export const DEFAULT_CHAT_MESSAGES_PER_MINUTE = 20;

/**
 * LC-3, §6: the live connection, under the API's own prefix so Caddy's /api proxy carries it with the edge secret. Only
 * WebSocket is offered: two API containers, each with several workers, would need sticky sessions for long polling, so
 * a browser whose socket can't connect reads the chat every CHAT_POLL_SECONDS while it is open instead.
 */
export const CHAT_SOCKET_PATH = '/api/v1/chat/socket';
export const CHAT_SOCKETS_PER_PERSON = 3;
export const CHAT_POLL_SECONDS = 20;
/** LC-19: Home's button shows this long each time Home opens. */
export const CHAT_HOME_PEEK_SECONDS = 5;

/** A message as the console's live connection carries it: with its shop. */
export interface ChatLiveMessage extends ChatMessageView {
  tenantId: string;
  shopName: string;
}

/** What the live connection tells a browser. Writes go over HTTPS; the socket only tells. */
export enum ChatSocketEvent {
  /** A new message in the shop's chat (the dashboard), or in any chat (the console). */
  Message = 'chat:message',
  /** Someone read the chat: the console's counts change. */
  Read = 'chat:read',
  /** The chat was switched off for this shop: the dashboard closes it. */
  Closed = 'chat:closed',
}

const trimmed = (max: number) => z.string().trim().max(max);

/** A photo upload to start: the browser then PUTs the file to the signed link and sends its key with the message. */
export const chatPhotoStartSchema = z.object({
  contentType: z.enum(CHAT_PHOTO_TYPES),
  bytes: z.number().int().positive().max(CHAT_PHOTO_MAX_BYTES),
});
export type ChatPhotoStartInput = z.infer<typeof chatPhotoStartSchema>;

/** A message: words, photos, or both; never neither. */
export const chatSendSchema = z
  .object({
    body: trimmed(CHAT_BODY_MAX).default(''),
    photoKeys: z.array(z.string().min(1).max(200)).max(CHAT_PHOTOS_MAX).default([]),
    page: trimmed(CHAT_PAGE_MAX).optional(),
  })
  .refine((input) => input.body.length > 0 || input.photoKeys.length > 0, {
    path: ['body'],
    message: 'Write a message or add a photo.',
    params: { problem: FieldProblemCode.Required },
  });
export type ChatSendInput = z.infer<typeof chatSendSchema>;

export const chatQuickReplySchema = z.object({
  title: trimmed(CHAT_QUICK_REPLY_TITLE_MAX).min(1),
  body: trimmed(CHAT_QUICK_REPLY_BODY_MAX).min(1),
});
export type ChatQuickReplyInput = z.infer<typeof chatQuickReplySchema>;

export const chatQuickReplyOrderSchema = z.object({
  ids: z.array(z.uuid()).max(CHAT_QUICK_REPLIES_MAX),
});
export type ChatQuickReplyOrderInput = z.infer<typeof chatQuickReplyOrderSchema>;

export const chatFeatureModeSchema = z.object({ mode: z.enum(ChatFeatureMode) });
export type ChatFeatureModeInput = z.infer<typeof chatFeatureModeSchema>;

/** A message as both sides read it. Each side draws its own on the right: the shop's people, or Lytro. */
export interface ChatMessageView {
  id: string;
  senderKind: ChatSenderKind;
  senderName: string | null;
  systemKind: ChatSystemKind | null;
  body: string;
  photos: { id: string; removed: boolean }[];
  createdAt: string;
}

/** The dashboard's chat: switched on or not, the hours, and a week of messages. */
export interface ChatView {
  enabled: boolean;
  messages: ChatMessageView[];
  unread: number;
  historyDays: number;
  hours: { opensHour: number; closesHour: number; open: boolean };
  whatsapp: string | null;
}

/** One shop in Lytro's inbox. */
export interface ChatInboxItem {
  tenantId: string;
  shopName: string;
  slug: string;
  planName: string | null;
  lastPreview: string;
  lastSenderKind: ChatSenderKind;
  lastMessageAt: string;
  waitingSince: string | null;
  unread: number;
}

/** The console's floating button: chats waiting for a person, and the latest shop among them. */
export interface ChatWaitingSummary {
  waiting: number;
  latestShop: string | null;
  latestTenantId: string | null;
}
