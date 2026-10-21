import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  numeric,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { AddonKind, AddonPurchaseStatus, PLAN_PAYMENT_METHODS } from '@lytronix/validators';
import { control, createdAt } from '../shared';
import { planPayments } from './plan-payments';
import { tenants } from './tenancy';

function oneOf(values: readonly string[]) {
  return sql.raw(values.map((value) => `'${value}'`).join(','));
}

// PLN-13: the add-on catalogue, editable data. A limit add-on and a pack name the limit they raise and how much one
// unit adds, in that limit's own unit; a feature add-on names neither. The price is whole taka: a month of a limit or
// feature add-on, or one pack. A retired item can no longer be bought; what was bought runs to its end.
export const addons = control.table(
  'addons',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    key: text('key').notNull().unique(),
    kind: text('kind').$type<AddonKind>().notNull(),
    limitKey: text('limit_key'),
    unitSize: integer('unit_size'),
    price: numeric('price', { precision: 10, scale: 2 }).notNull(),
    labelEn: text('label_en').notNull(),
    labelBn: text('label_bn').notNull(),
    retiredAt: timestamp('retired_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [check('addons_kind_check', sql`${t.kind} in (${oneOf(Object.values(AddonKind))})`)],
);

// PLN-14: an add-on a shop bought. It keeps what the catalogue said when it was bought -- its kind, the limit it raises
// and how much one unit adds -- so a later catalogue edit never changes it. Pending while its payment is quoted;
// counted only while active and between its start and its end.
export const addonPurchases = control.table(
  'addon_purchases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    addonId: uuid('addon_id')
      .notNull()
      .references(() => addons.id),
    kind: text('kind').$type<AddonKind>().notNull(),
    limitKey: text('limit_key'),
    unitSize: integer('unit_size'),
    quantity: integer('quantity').notNull().default(1),
    // What the period cost when bought, prorated (PLN-14).
    price: numeric('price', { precision: 10, scale: 2 }).notNull(),
    status: text('status')
      .$type<AddonPurchaseStatus>()
      .notNull()
      .default(AddonPurchaseStatus.Pending),
    paidFrom: text('paid_from').$type<'balance' | 'wallet'>().notNull(),
    planPaymentId: uuid('plan_payment_id').references(() => planPayments.id),
    renews: boolean('renews').notNull().default(true),
    purchasedAt: timestamp('purchased_at', { withTimezone: true }).notNull().defaultNow(),
    startsAt: timestamp('starts_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    index('addon_purchases_tenant_idx').on(t.tenantId, t.status, t.expiresAt),
    check(
      'addon_purchases_status_check',
      sql`${t.status} in (${oneOf(Object.values(AddonPurchaseStatus))})`,
    ),
    check(
      'addon_purchases_paid_from_check',
      sql`${t.paidFrom} in (${oneOf(PLAN_PAYMENT_METHODS)})`,
    ),
    check('addon_purchases_quantity_check', sql`${t.quantity} > 0`),
  ],
);

export type SelectAddon = typeof addons.$inferSelect;
export type SelectAddonPurchase = typeof addonPurchases.$inferSelect;
