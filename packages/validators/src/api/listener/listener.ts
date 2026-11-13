import { z } from 'zod';
import {
  LISTENER_APP_VERSION_MAX_LENGTH,
  LISTENER_CODE_LENGTH,
  LISTENER_DEVICE_NAME_MAX_LENGTH,
  LISTENER_INSTALLATION_ID_MAX_LENGTH,
  LISTENER_RECEIPT_PAGE_SIZE,
  LISTENER_RECENT_DEFAULT,
  LISTENER_RECENT_MAX,
  LISTENER_SENDER_MAX_LENGTH,
} from '../../common/limits';
import { LISTENER_APP_VERSION_PATTERN } from '../../common/listener-release';
import { ListenerMessageStatus } from '../../db/enums';

// LSN-09 (Phase 5 Slice 5.4a): a pairing code's letters -- no 0/O, 1/I/L, so it reads aloud and types without mistakes.
export const LISTENER_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

// LSN-18: the oldest app version the operator lets call, `major.minor.patch`: numbers only.
const APP_VERSION = /^\d{1,4}\.\d{1,4}\.\d{1,4}$/;

/** A version's three numbers, any tag after them left off (`1.0.0-staging` is 1, 0, 0). */
const numbersOf = (version: string): number[] =>
  (version.split('-')[0] ?? '').split('.').map(Number);

/**
 * LSN-18: two versions' three numbers, compared in order: negative when `a` is older than `b`. A tag counts for nothing,
 * so a staging build `1.0.0-staging` meets a minimum of 1.0.0, as the same build without its tag would.
 */
export function compareAppVersions(a: string, b: string): number {
  const left = numbersOf(a);
  const right = numbersOf(b);
  for (let index = 0; index < 3; index += 1) {
    const diff = (left[index] ?? 0) - (right[index] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** LSN-18: the minimum app version the operator sets (`listener_min_app_version`): numbers only. */
export const appVersionField = z.string().trim().regex(APP_VERSION, 'Like 1.2.3.');

/**
 * LSN-18: the version a phone's app gives (`x-app-version`): numbers, or with one tag, as staging's build is
 * `1.0.0-staging` (its versionNameSuffix). Kept on the phone's row as given.
 */
export const appBuildVersionField = z
  .string()
  .trim()
  .max(LISTENER_APP_VERSION_MAX_LENGTH)
  .regex(LISTENER_APP_VERSION_PATTERN, 'Like 1.2.3.');

// LSN-11: the app's own installation ID, made once on the phone, which a device token is bound to.
export const installationIdField = z
  .string()
  .trim()
  .min(8)
  .max(LISTENER_INSTALLATION_ID_MAX_LENGTH)
  .regex(/^[A-Za-z0-9_-]+$/);

const deviceNameField = z.string().trim().min(1).max(LISTENER_DEVICE_NAME_MAX_LENGTH);

/**
 * LSN-01, LSN-09, LSN-11 (Phase 5 Slice 5.4a): the listener app pairing a phone -- the code the owner made, read in
 * capitals; the app's installation ID; and what the phone calls itself. Every app call names the app's version in the
 * `x-app-version` header (LSN-18).
 */
export const listenerPairSchema = z
  .object({
    code: z
      .string()
      .trim()
      .length(LISTENER_CODE_LENGTH)
      .transform((value) => value.toUpperCase()),
    installationId: installationIdField,
    name: deviceNameField.optional(),
    model: z.string().trim().min(1).max(100).optional(),
  })
  .strict();
export type ListenerPairInput = z.infer<typeof listenerPairSchema>;

/** LSN-20: a phone renamed by its shop. */
export const renameListenerDeviceSchema = z.object({ name: deviceNameField }).strict();
export type RenameListenerDeviceInput = z.infer<typeof renameListenerDeviceSchema>;

/**
 * LSN-13, LSN-15 (Phase 5 Slice 5.4b): the messages a phone forwards. The batch's size and a message's length are not
 * checked here, since going over them answers 413, not a validation error (LSN-13).
 */
export const listenerUploadSchema = z
  .object({
    messages: z
      .array(
        z
          .object({
            sender: z.string().trim().min(1).max(LISTENER_SENDER_MAX_LENGTH),
            text: z.string().min(1),
            receivedAt: z.coerce.date(),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();
export type ListenerUploadInput = z.infer<typeof listenerUploadSchema>;

/** The receipts the app shows on its home screen. */
export const listenerRecentQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(LISTENER_RECENT_MAX).default(LISTENER_RECENT_DEFAULT),
});
export type ListenerRecentQuery = z.infer<typeof listenerRecentQuerySchema>;

/**
 * Agreed 2026-11-02 (Slice 5.4b read): the receipts staff can list and search -- by where they stand, and by the start of a
 * transaction ID, a sender number or an amount.
 */
export const listenerReceiptsQuerySchema = z.object({
  status: z.nativeEnum(ListenerMessageStatus).optional(),
  q: z.string().trim().min(1).max(40).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(LISTENER_RECENT_MAX)
    .default(LISTENER_RECEIPT_PAGE_SIZE),
});
export type ListenerReceiptsQuery = z.infer<typeof listenerReceiptsQuerySchema>;

/** VER-06 (amended 2026-11-02): the masked shapes of the unreadable messages Lytro reads, by how many days back. */
export const listenerUnreadQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(7),
});
export type ListenerUnreadQuery = z.infer<typeof listenerUnreadQuerySchema>;

/**
 * BIL-06, BAL-03 (Slice 5.6, agreed 2026-11-03): the money the operator says arrived, when it is not what a receipt says or
 * what was quoted.
 */
export const queuedPaymentAmountSchema = z
  .object({ amount: z.number().positive().max(99_999_999.99).optional() })
  .strict()
  .optional();
export type QueuedPaymentAmountInput = z.infer<typeof queuedPaymentAmountSchema>;

/** LSN-21: an app installation Lytro blocks across the platform, with why. */
export const blockInstallationSchema = z
  .object({ installationId: installationIdField, reason: z.string().trim().min(1).max(500) })
  .strict();
export type BlockInstallationInput = z.infer<typeof blockInstallationSchema>;
