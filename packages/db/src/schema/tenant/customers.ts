import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  numeric,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { CUSTOMER_NAME_MAX_LENGTH } from '@lytronix/validators';
import { createdAt, tenant } from '../shared';

// DATABASE-SCHEMA §3.3, CUS-01: a shop's customer, one per phone number, made or updated by each order. Its counts are
// worked out again from its orders on every change, so they always agree with them: the orders not cancelled, and what
// the delivered ones came to; its name is the latest order's. A privacy erasure (CUS-09) clears the name and phone and
// sets `erased_at`.
export const customers = tenant.table(
  'customers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    // The local form, 01XXXXXXXXX; null once erased.
    phone: varchar('phone', { length: 15 }),
    name: varchar('name', { length: CUSTOMER_NAME_MAX_LENGTH }),
    orderCount: integer('order_count').notNull().default(0),
    totalSpent: numeric('total_spent', { precision: 12, scale: 2 }).notNull().default('0'),
    lastOrderAt: timestamp('last_order_at', { withTimezone: true }),
    erasedAt: timestamp('erased_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('customers_tenant_id_key').on(t.tenantId, t.id),
    uniqueIndex('customers_phone_idx')
      .on(t.tenantId, t.phone)
      .where(sql`${t.phone} IS NOT NULL`),
    // DAT-13, CUS-02: search by any part of the name or the phone, the last four digits say.
    index('customers_name_trgm_idx').using('gin', t.name.op('gin_trgm_ops')),
    index('customers_phone_trgm_idx').using('gin', t.phone.op('gin_trgm_ops')),
    index('customers_tenant_last_order_idx').on(t.tenantId, t.lastOrderAt.desc(), t.id.desc()),
    check(
      'customers_erased_check',
      sql`${t.erasedAt} IS NULL OR (${t.phone} IS NULL AND ${t.name} IS NULL)`,
    ),
  ],
);

export type SelectCustomer = typeof customers.$inferSelect;
