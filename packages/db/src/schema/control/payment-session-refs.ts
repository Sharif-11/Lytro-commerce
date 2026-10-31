import { timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { control } from '../shared';
import { tenants } from './tenancy';

// PAY-03, PAY-23, TEN-29 (Phase 5 Slice 5.2): the shop a payment page's address belongs to. The page names only the
// session's reference -- 128 random bits, 22 characters, short enough for a link sent by Messenger -- so its shop is
// found here before the shop is known, as a catalog feed's is, never from the host. The session itself is the shop's,
// in tenant.payment_sessions.
export const paymentSessionRefs = control.table('payment_session_refs', {
  ref: varchar('ref', { length: 32 }).primaryKey(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
