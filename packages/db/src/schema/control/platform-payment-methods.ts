import {
  boolean,
  bigserial,
  index,
  integer,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import type { CredentialUseAction, PaymentMethod, PaymentWay } from '@lytronix/validators';
import { bytea, control, createdAt } from '../shared';

// OPERATOR-CONSOLE-DESIGN §10 (2026-11-09): what the operator chose for a method shops pay Lytro by. No row is the starting
// choice: on, by the way the method starts on (`startingWayOf`), so nothing changes until the operator acts.
export const platformPaymentMethods = control.table('platform_payment_methods', {
  method: text('method').$type<PaymentMethod>().primaryKey(),
  enabled: boolean('enabled').notNull(),
  way: text('way').$type<PaymentWay>().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// WAL-14's fields: Lytro's own bank accounts, shown to shops in the operator's order.
export const platformBankAccounts = control.table('platform_bank_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  bankName: text('bank_name').notNull(),
  accountName: text('account_name').notNull(),
  accountNumber: text('account_number').notNull(),
  branch: text('branch'),
  routingNumber: text('routing_number'),
  swiftCode: text('swift_code'),
  instructions: text('instructions'),
  enabled: boolean('enabled').notNull().default(true),
  displayOrder: integer('display_order').notNull().default(0),
  createdAt: createdAt(),
});

// ADM-10: Lytro's own merchant account for a wallet's checkout. The keys are sealed and never returned.
export const platformGatewayAccounts = control.table('platform_gateway_accounts', {
  method: text('method').$type<PaymentMethod>().primaryKey(),
  number: varchar('number', { length: 20 }).notNull(),
  credentials: bytea('credentials').notNull(),
  sandbox: boolean('sandbox').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// SEC-11: each use of Lytro's own keys, without the keys. bKash allows two token calls an hour, and a restart must not forget them.
export const platformGatewayUses = control.table(
  'platform_gateway_uses',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    method: text('method').$type<PaymentMethod>().notNull(),
    action: text('action').$type<CredentialUseAction>().notNull(),
    paymentId: uuid('payment_id'),
    succeeded: boolean('succeeded').notNull(),
    at: timestamp('at', { withTimezone: true }).notNull(),
  },
  (t) => [index('platform_gateway_uses_action_at_idx').on(t.method, t.action, t.at)],
);

export type SelectPlatformPaymentMethod = typeof platformPaymentMethods.$inferSelect;
export type SelectPlatformBankAccount = typeof platformBankAccounts.$inferSelect;
export type InsertPlatformBankAccount = typeof platformBankAccounts.$inferInsert;
export type SelectPlatformGatewayAccount = typeof platformGatewayAccounts.$inferSelect;
