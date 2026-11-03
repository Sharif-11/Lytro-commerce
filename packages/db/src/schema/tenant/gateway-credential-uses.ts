import { boolean, index, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import type { CredentialUseAction, PaymentMethod } from '@lytronix/validators';
import { tenant } from '../shared';

// SEC-11 (Phase 5 Slice 5.7, agreed 2026-11-03): every outbound call made with a shop's stored gateway credential -- when, to which
// gateway, what for and for which payment, and whether it worked -- never the credential or token. Each shop's own, for the
// operator to read and a dispute to be answered from; it goes with the shop at day 60. RLS like every tenant table.
export const gatewayCredentialUses = tenant.table(
  'gateway_credential_uses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    method: text('method').$type<PaymentMethod>().notNull(),
    action: text('action').$type<CredentialUseAction>().notNull(),
    accountId: uuid('account_id').notNull(),
    sessionId: uuid('session_id'),
    succeeded: boolean('succeeded').notNull(),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('gateway_credential_uses_tenant_idx').on(t.tenantId, t.at)],
);

export type SelectGatewayCredentialUse = typeof gatewayCredentialUses.$inferSelect;
