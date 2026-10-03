import { bigserial, inet, jsonb, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { control, createdAt } from '../shared';

// DATABASE-SCHEMA §2.4 (ADM-11, DAT-01): every platform-wide editable value.
export const platformSettings = control.table('platform_settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  description: text('description').notNull(),
  updatedBy: uuid('updated_by').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// DATABASE-SCHEMA §2.4 (AUD, ADM): insert-only. A trigger rejects UPDATE and DELETE.
export const platformAuditLog = control.table('platform_audit_log', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  actorType: text('actor_type').notNull(),
  actorId: uuid('actor_id'),
  action: text('action').notNull(),
  targetType: text('target_type'),
  targetId: uuid('target_id'),
  result: text('result').notNull(),
  ip: inet('ip'),
  summary: jsonb('summary'),
  createdAt: createdAt(),
});
