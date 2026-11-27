import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  ChatFeatureMode,
  ChatSenderKind,
  ChatSystemKind,
  chatFeatureModeSchema,
  chatPhotoStartSchema,
  chatQuickReplyOrderSchema,
  chatQuickReplySchema,
  chatSendSchema,
  dateField,
  pushSubscriptionSchema,
  pushUnsubscribeSchema,
} from '@lytronix/validators';

// LIVE-CHAT-PLAN (PR 1): the chat's request and answer shapes, each written once.
export class ChatSendDto extends createZodDto(chatSendSchema) {}
export class ChatPhotoStartDto extends createZodDto(chatPhotoStartSchema) {}
export class ChatQuickReplyDto extends createZodDto(chatQuickReplySchema) {}
export class ChatQuickReplyOrderDto extends createZodDto(chatQuickReplyOrderSchema) {}
export class ChatFeatureModeDto extends createZodDto(chatFeatureModeSchema) {}
export class OperatorPushSubscriptionDto extends createZodDto(pushSubscriptionSchema) {}
export class OperatorPushUnsubscribeDto extends createZodDto(pushUnsubscribeSchema) {}

// A kind written by a later release still reads (readers before writers): text, not a strict enum.
const senderKind = z.union([z.enum(ChatSenderKind), z.string().min(1).max(32)]);
const systemKind = z.union([z.enum(ChatSystemKind), z.string().min(1).max(32)]).nullable();

export const chatMessageViewSchema = z.object({
  id: z.string(),
  senderKind,
  senderName: z.string().nullable(),
  systemKind,
  body: z.string(),
  photos: z.array(z.object({ id: z.string(), removed: z.boolean() })),
  createdAt: z.string(),
});

export class ChatMessageDto extends createZodDto(chatMessageViewSchema) {}

export class ChatViewDto extends createZodDto(
  z.object({
    enabled: z.boolean(),
    messages: z.array(chatMessageViewSchema),
    unread: z.number().int(),
    historyDays: z.number().int(),
    hours: z.object({
      opensHour: z.number().int(),
      closesHour: z.number().int(),
      open: z.boolean(),
    }),
    whatsapp: z.string().nullable(),
  }),
) {}

export class ChatReadDto extends createZodDto(z.object({ unread: z.number().int() })) {}

export class ChatPhotoUploadDto extends createZodDto(
  z.object({
    key: z.string(),
    upload: z.object({
      url: z.string(),
      method: z.literal('PUT'),
      headers: z.record(z.string(), z.string()),
      expiresAt: dateField(),
    }),
  }),
) {}

export class ChatInboxDto extends createZodDto(
  z.object({
    items: z.array(
      z.object({
        tenantId: z.string(),
        shopName: z.string(),
        slug: z.string(),
        planName: z.string().nullable(),
        lastPreview: z.string(),
        lastSenderKind: senderKind,
        lastMessageAt: z.string(),
        waitingSince: z.string().nullable(),
        unread: z.number().int(),
      }),
    ),
  }),
) {}

export class ChatWaitingDto extends createZodDto(
  z.object({
    waiting: z.number().int(),
    latestShop: z.string().nullable(),
    latestTenantId: z.string().nullable(),
  }),
) {}

const featureStateSchema = z.object({
  plan: z.boolean(),
  mode: z.enum(ChatFeatureMode),
  on: z.boolean(),
});

export class ChatFeatureStateDto extends createZodDto(featureStateSchema) {}

export class ChatLytroDetailDto extends createZodDto(
  z.object({
    shop: z.object({
      tenantId: z.string(),
      shopName: z.string(),
      slug: z.string(),
      state: z.string(),
      suspended: z.boolean(),
      planName: z.string().nullable(),
      periodEnd: dateField().nullable(),
      balance: z.string(),
    }),
    feature: featureStateSchema,
    messages: z.array(chatMessageViewSchema),
    lastPage: z.string().nullable(),
    errors: z.array(
      z.object({
        status: z.number().int(),
        method: z.string(),
        route: z.string().nullable(),
        createdAt: dateField(),
      }),
    ),
    people: z.array(z.object({ id: z.string(), name: z.string().nullable(), owner: z.boolean() })),
    historyDays: z.number().int(),
  }),
) {}

const quickReplySchema = z.object({ id: z.string(), title: z.string(), body: z.string() });

export class ChatQuickReplyViewDto extends createZodDto(quickReplySchema) {}
export class ChatQuickRepliesDto extends createZodDto(
  z.object({ items: z.array(quickReplySchema) }),
) {}
export class ChatOkDto extends createZodDto(z.object({ ok: z.literal(true) })) {}
export class OperatorPushKeyDto extends createZodDto(
  z.object({ publicKey: z.string().nullable() }),
) {}
export class OperatorPushSubscribedDto extends createZodDto(
  z.object({ subscribed: z.boolean() }),
) {}
