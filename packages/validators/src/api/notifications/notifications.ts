import { z } from 'zod';
import { isPushServiceUrl, NOTIFICATION_KINDS } from '../../common/notification-kinds';
import { NotificationKind } from '../../db/enums';
import { FieldProblemCode } from '../../validation/field-problem';

/** NTF-01: the most notifications one page of the bell holds. */
export const NOTIFICATIONS_PAGE_MAX = 50;

/** NTF-01: a page of the person's own notifications, newest first, after the one named by `before`. */
export const notificationsQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(NOTIFICATIONS_PAGE_MAX).default(30),
    before: z.string().uuid().optional(),
  })
  .strict();
export type NotificationsQuery = z.infer<typeof notificationsQuerySchema>;

/** NTF-01: mark some of the person's notifications read, or all of them -- one or the other. */
export const notificationsReadSchema = z
  .object({
    notificationIds: z.array(z.string().uuid()).min(1).max(NOTIFICATIONS_PAGE_MAX).optional(),
    all: z.literal(true).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if ((value.notificationIds === undefined) === (value.all === undefined)) {
      ctx.addIssue({
        code: 'custom',
        path: [],
        message: 'Name the notifications, or all of them.',
        params: { problem: FieldProblemCode.NothingToChange },
      });
    }
  });
export type NotificationsReadInput = z.infer<typeof notificationsReadSchema>;

/**
 * NTF-04, D7-40: the kinds the person has switched off, the whole list. A money or account kind can't be switched off,
 * so naming one is refused.
 */
export const notificationPreferencesSchema = z
  .object({
    off: z.array(z.nativeEnum(NotificationKind)).max(Object.values(NotificationKind).length),
  })
  .strict()
  .superRefine((value, ctx) => {
    value.off.forEach((kind, index) => {
      if (!NOTIFICATION_KINDS[kind].switchable) {
        ctx.addIssue({
          code: 'custom',
          path: ['off', index],
          message: 'This notification always stays on.',
          params: { problem: FieldProblemCode.NotAllowed },
        });
      }
    });
  });
export type NotificationPreferencesInput = z.infer<typeof notificationPreferencesSchema>;

// The keys a browser gives with its subscription: base64url, as the Push API writes them.
const pushKey = z
  .string()
  .min(16)
  .max(200)
  .regex(/^[A-Za-z0-9_-]+=*$/);

/** NTF-02: a browser's push subscription, as `PushSubscription.toJSON()` gives it, on one of the push services. */
export const pushSubscriptionSchema = z
  .object({
    endpoint: z
      .string()
      .url()
      .max(1000)
      .refine(isPushServiceUrl, {
        message: 'Not a push service address.',
        params: { problem: FieldProblemCode.NotAllowed },
      }),
    expirationTime: z.number().nullable().optional(),
    keys: z.object({ p256dh: pushKey, auth: pushKey }).strict(),
  })
  .strict();
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;

/** NTF-02: stop pushing to a browser. */
export const pushUnsubscribeSchema = z.object({ endpoint: z.string().url().max(1000) }).strict();
export type PushUnsubscribeInput = z.infer<typeof pushUnsubscribeSchema>;
