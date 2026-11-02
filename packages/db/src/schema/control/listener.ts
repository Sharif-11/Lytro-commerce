import { sql } from 'drizzle-orm';
import { char, index, integer, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import {
  enumTuple,
  LISTENER_DEVICE_NAME_MAX_LENGTH,
  LISTENER_INSTALLATION_ID_MAX_LENGTH,
  ListenerRevokeReason,
} from '@lytronix/validators';
import { control, createdAt } from '../shared';
import { tenants } from './tenancy';

export const listenerRevokeReason = control.enum(
  'listener_revoke_reason',
  enumTuple(Object.values(ListenerRevokeReason)),
);

// LSN-01, LSN-09, LSN-10 (Phase 5 Slice 5.4a): a code the owner makes to pair a listener phone -- single use, open
// [10] minutes, void after [10] tries. In the control schema, as API keys are, because the app pairing with it is not
// yet known to any shop; only its SHA-256 hash is kept, the code itself shown once. Purged a day after it is spent or
// runs out (LSN-05).
export const listenerPairingCodes = control.table(
  'listener_pairing_codes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    codeHash: char('code_hash', { length: 64 }).notNull().unique(),
    createdBy: uuid('created_by'),
    createdAt: createdAt(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    // Paired with, or voided after too many wrong tries; either way it pairs nothing more.
    usedAt: timestamp('used_at', { withTimezone: true }),
    voidedAt: timestamp('voided_at', { withTimezone: true }),
    tries: integer('tries').notNull().default(0),
  },
  (t) => [index('listener_pairing_codes_tenant_idx').on(t.tenantId, t.createdAt)],
);

// LSN-01 to LSN-03, LSN-11, LSN-12, LSN-19 to LSN-21 (Phase 5 Slice 5.4a): a shop's paired listener phones. A device's
// token is [32] random bytes kept only as its SHA-256 hash, bound to the shop and the app installation that paired it;
// a call from another installation flags the device, and [3] flags revoke it. Revoked devices stay as history until the
// purge (LSN-05); every one goes at day 60 (LSN-23). In the control schema because the app is found by its token
// before its shop is known.
export const listenerDevices = control.table(
  'listener_devices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    name: varchar('name', { length: LISTENER_DEVICE_NAME_MAX_LENGTH }).notNull(),
    model: varchar('model', { length: 100 }),
    appVersion: varchar('app_version', { length: 20 }).notNull(),
    installationId: varchar('installation_id', {
      length: LISTENER_INSTALLATION_ID_MAX_LENGTH,
    }).notNull(),
    tokenHash: char('token_hash', { length: 64 }).notNull().unique(),
    pairedBy: uuid('paired_by'),
    pairedAt: timestamp('paired_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    flags: integer('flags').notNull().default(0),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedBy: uuid('revoked_by'),
    revokeReason: listenerRevokeReason('revoke_reason'),
  },
  (t) => [
    index('listener_devices_tenant_idx').on(t.tenantId, t.pairedAt),
    index('listener_devices_installation_idx').on(t.installationId),
    index('listener_devices_revoked_idx')
      .on(t.revokedAt)
      .where(sql`${t.revokedAt} IS NOT NULL`),
  ],
);

// LSN-21 (Phase 5 Slice 5.4a): an app installation Lytro blocked across the platform -- it pairs with no shop again,
// and its devices are revoked.
export const listenerBlockedInstallations = control.table('listener_blocked_installations', {
  installationId: varchar('installation_id', {
    length: LISTENER_INSTALLATION_ID_MAX_LENGTH,
  }).primaryKey(),
  reason: text('reason').notNull(),
  blockedBy: uuid('blocked_by'),
  blockedAt: timestamp('blocked_at', { withTimezone: true }).notNull().defaultNow(),
});

export type SelectListenerPairingCode = typeof listenerPairingCodes.$inferSelect;
export type SelectListenerDevice = typeof listenerDevices.$inferSelect;
