import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  NotificationKind,
  notificationPreferencesSchema,
  notificationsQuerySchema,
  notificationsReadSchema,
  pushSubscriptionSchema,
  pushUnsubscribeSchema,
} from '@lytronix/validators';

// NTF-01 to NTF-04 (Phase 7 Slice 7.3): the bell, the switches and push, each request shape written once.
export class NotificationsQueryDto extends createZodDto(notificationsQuerySchema) {}
export class NotificationsReadDto extends createZodDto(notificationsReadSchema) {}
export class NotificationPreferencesDto extends createZodDto(notificationPreferencesSchema) {}
export class PushSubscriptionDto extends createZodDto(pushSubscriptionSchema) {}
export class PushUnsubscribeDto extends createZodDto(pushUnsubscribeSchema) {}

const notificationViewSchema = z.object({
  id: z.string(),
  kind: z.nativeEnum(NotificationKind),
  title: z.string(),
  body: z.string(),
  // A dashboard path within the shop, such as /orders/<id>; the dashboard puts the shop's slug in front.
  link: z.string().nullable(),
  createdAt: z.date(),
  read: z.boolean(),
});

export class NotificationPageDto extends createZodDto(
  z.object({
    items: z.array(notificationViewSchema),
    unread: z.number().int(),
    next: z.string().nullable(),
  }),
) {}

export class NotificationsMarkedDto extends createZodDto(
  z.object({ marked: z.number().int(), unread: z.number().int() }),
) {}

export class NotificationSwitchesDto extends createZodDto(
  z.object({
    kinds: z.array(
      z.object({
        kind: z.nativeEnum(NotificationKind),
        group: z.enum(['orders', 'payments', 'couriers', 'stock', 'media', 'account']),
        on: z.boolean(),
        locked: z.boolean(),
      }),
    ),
  }),
) {}

export class PushKeyDto extends createZodDto(z.object({ publicKey: z.string().nullable() })) {}

export class PushSubscribedDto extends createZodDto(z.object({ subscribed: z.boolean() })) {}

export class PushTestDto extends createZodDto(
  z.object({ sent: z.number().int(), gone: z.number().int(), failed: z.number().int() }),
) {}
