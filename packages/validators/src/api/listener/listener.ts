import { z } from 'zod';
import {
  LISTENER_CODE_LENGTH,
  LISTENER_DEVICE_NAME_MAX_LENGTH,
  LISTENER_INSTALLATION_ID_MAX_LENGTH,
} from '../../common/limits';

// LSN-09 (Phase 5 Slice 5.4a): a pairing code's letters -- no 0/O, 1/I/L, so it reads aloud and types without mistakes.
export const LISTENER_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

// LSN-18: an app version, `major.minor.patch`.
const APP_VERSION = /^\d{1,4}\.\d{1,4}\.\d{1,4}$/;

/** LSN-18: an app version's three parts, compared in order: negative when `a` is older than `b`. */
export function compareAppVersions(a: string, b: string): number {
  const left = a.split('.').map(Number);
  const right = b.split('.').map(Number);
  for (let index = 0; index < 3; index += 1) {
    const diff = (left[index] ?? 0) - (right[index] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export const appVersionField = z.string().trim().regex(APP_VERSION, 'Like 1.2.3.');

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

/** LSN-21: an app installation Lytro blocks across the platform, with why. */
export const blockInstallationSchema = z
  .object({ installationId: installationIdField, reason: z.string().trim().min(1).max(500) })
  .strict();
export type BlockInstallationInput = z.infer<typeof blockInstallationSchema>;
