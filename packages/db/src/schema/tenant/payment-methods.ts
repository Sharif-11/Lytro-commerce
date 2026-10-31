import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  primaryKey,
  smallint,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import {
  BANK_FIELD_MAX_LENGTH,
  BANK_INSTRUCTIONS_MAX_LENGTH,
  enumTuple,
  PAYMENT_ACCOUNT_NAME_MAX_LENGTH,
  PAYMENT_ACCOUNT_NOTE_MAX_LENGTH,
  WalletAccountType,
} from '@lytronix/validators';
import { createdAt, tenant } from '../shared';
import { paymentMethod } from './orders';

export const walletAccountType = tenant.enum(
  'wallet_account_type',
  enumTuple(Object.values(WalletAccountType)),
);

// WAL-01 to WAL-17 (Phase 5 Slice 5.1): the accounts a shop takes money into -- a wallet's number and account type, or a
// bank account's details (WAL-14) -- keyed by the same methods as order payments, never cash. At most one active per
// method (WAL-03), the one shoppers see (WAL-06); the same number or bank account once per method (WAL-02). Owner only
// (WAL-07). Gateway credentials and the account selected for automated payments come with Slice 5.7.
export const walletAccounts = tenant.table(
  'wallet_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    method: paymentMethod('method').notNull(),
    accountName: varchar('account_name', { length: PAYMENT_ACCOUNT_NAME_MAX_LENGTH }).notNull(),
    // A wallet's, in local form; Rocket's may be 12 digits.
    number: varchar('number', { length: 12 }),
    accountType: walletAccountType('account_type'),
    note: varchar('note', { length: PAYMENT_ACCOUNT_NOTE_MAX_LENGTH }),
    bankName: varchar('bank_name', { length: BANK_FIELD_MAX_LENGTH }),
    accountNumber: varchar('account_number', { length: BANK_FIELD_MAX_LENGTH }),
    branch: varchar('branch', { length: BANK_FIELD_MAX_LENGTH }),
    routingNumber: varchar('routing_number', { length: BANK_FIELD_MAX_LENGTH }),
    swiftCode: varchar('swift_code', { length: BANK_FIELD_MAX_LENGTH }),
    instructions: varchar('instructions', { length: BANK_INSTRUCTIONS_MAX_LENGTH }),
    active: boolean('active').notNull().default(false),
    // The order the shop listed them, from 0.
    position: smallint('position').notNull(),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('wallet_accounts_tenant_id_key').on(t.tenantId, t.id),
    uniqueIndex('wallet_accounts_active_key')
      .on(t.tenantId, t.method)
      .where(sql`${t.active}`),
    uniqueIndex('wallet_accounts_number_key')
      .on(t.tenantId, t.method, t.number)
      .where(sql`${t.number} IS NOT NULL`),
    uniqueIndex('wallet_accounts_account_number_key')
      .on(t.tenantId, t.method, sql`lower(${t.accountNumber})`)
      .where(sql`${t.accountNumber} IS NOT NULL`),
    check('wallet_accounts_method_check', sql`${t.method} NOT IN ('cash', 'cash_on_delivery')`),
    check(
      'wallet_accounts_kind_check',
      sql`CASE WHEN ${t.method} = 'bank'
        THEN ${t.bankName} IS NOT NULL AND ${t.accountNumber} IS NOT NULL AND ${t.number} IS NULL
          AND ${t.accountType} IS NULL
        ELSE ${t.number} IS NOT NULL AND ${t.accountType} IS NOT NULL AND ${t.bankName} IS NULL
          AND ${t.accountNumber} IS NULL AND ${t.branch} IS NULL AND ${t.routingNumber} IS NULL
          AND ${t.swiftCode} IS NULL AND ${t.instructions} IS NULL END`,
    ),
  ],
);

export type SelectWalletAccount = typeof walletAccounts.$inferSelect;
export type InsertWalletAccount = typeof walletAccounts.$inferInsert;

// WAL-05, WAL-15: a method the shop switched off -- shoppers see none of its accounts and it is not offered. A row
// means off, so every method is on until switched off.
export const paymentMethodsOff = tenant.table(
  'payment_methods_off',
  {
    tenantId: uuid('tenant_id').notNull(),
    method: paymentMethod('method').notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.method] })],
);
