import { text, timestamp } from 'drizzle-orm/pg-core';
import { RetireState, type AccountMethod } from '@lytronix/validators';
import { control } from '../shared';

// WAL-18 (Phase 8 Slice 8.7, D8-18, D8-65): how the platform holds each payment method type, the couriers' way (CRR-23,
// CRR-24). A type with no row is active. Retiring keeps every shop that set it up taking money by it, checkout included, and
// lets no other shop start; removed is for good, once no shop has it on and no payment is open on it, and its code goes in a
// later change. The types themselves stay in the code (PAYMENT_METHOD_TYPES). Platform-wide, so no RLS.
export const paymentMethodTypes = control.table('payment_method_types', {
  method: text('method').$type<AccountMethod>().primaryKey(),
  state: text('state').$type<RetireState>().notNull().default(RetireState.Active),
  retiringSince: timestamp('retiring_since', { withTimezone: true }),
  removedAt: timestamp('removed_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type SelectPaymentMethodType = typeof paymentMethodTypes.$inferSelect;
