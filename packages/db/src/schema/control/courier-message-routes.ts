import { text, uuid } from 'drizzle-orm/pg-core';
import type { CourierKey } from '@lytronix/validators';
import { control, createdAt } from '../shared';

// CRR-11, CRR-20 (Phase 6 Slice 6.2): the hash of a message address's token, and whose connection it is. No courier's message says
// which shop it belongs to, so this finds the shop before any tenant data is read, and an address that isn't here is refused
// before any adapter code runs. It goes when the courier is disconnected or the address replaced.
export const courierMessageRoutes = control.table('courier_message_routes', {
  tokenHash: text('token_hash').primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  courierKey: text('courier_key').$type<CourierKey>().notNull(),
  connectionId: uuid('connection_id').notNull().unique(),
  createdAt: createdAt(),
});

export type SelectCourierMessageRoute = typeof courierMessageRoutes.$inferSelect;
