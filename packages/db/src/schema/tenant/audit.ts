import { bigserial, index, jsonb, text, uuid } from 'drizzle-orm/pg-core';
import { createdAt, tenant } from '../shared';

// DATABASE-SCHEMA §3.5. Insert-only: a trigger created in the migration refuses UPDATE and DELETE (DAT-10, AUD-03).
export const activityLog = tenant.table(
  'activity_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    actorType: text('actor_type').notNull(), // user | api_key | system | platform_support
    actorId: uuid('actor_id'),
    action: text('action').notNull(),
    targetType: text('target_type'),
    targetId: uuid('target_id'),
    result: text('result').notNull(),
    summary: jsonb('summary'),
    createdAt: createdAt(),
  },
  (t) => [index('activity_log_tenant_created_idx').on(t.tenantId, t.createdAt)],
);
