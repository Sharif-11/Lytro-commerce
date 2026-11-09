import {
  bigint,
  date,
  index,
  integer,
  jsonb,
  numeric,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import type { LedgerEntryType, TenantState } from '@lytronix/validators';
import { control } from '../shared';
import { tenants } from './tenancy';

// ADM-09, D8-9, D8-40 to D8-46 (Phase 8 Slice 8.4, read agreed 2026-11-08): each shop's day, recorded each night, so the
// operator's reports read figures across shops from a Lytro table and never cross a shop's row-level security. One row
// a shop a Dhaka day; a night's run that is repeated replaces its own rows.
export const shopDays = control.table(
  'shop_days',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    // The Asia/Dhaka day the figures are for.
    day: date('day', { mode: 'string' }).notNull(),
    // Where the shop stood when the day was recorded, for the shop counts and their movements (D8-41).
    state: text('state').$type<TenantState>().notNull(),
    planId: uuid('plan_id'),
    // The shop's storage when recorded (STO-01), the same figure its usage page shows.
    storageBytes: bigint('storage_bytes', { mode: 'number' }).notNull().default(0),
    // The SMS units the shop's own SMS sent that day (SMS-09).
    smsUnits: integer('sms_units').notNull().default(0),
    // What the shop spent from its balance that day, by ledger type, in taka (D8-40): only the charges, never a top-up.
    spend: jsonb('spend').$type<Partial<Record<LedgerEntryType, string>>>().notNull().default({}),
    // What the balance gave back that day (reversals of charges), in taka.
    givenBack: numeric('given_back', { precision: 12, scale: 2 }).notNull().default('0'),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.day] }), index('shop_days_day_idx').on(t.day)],
);
