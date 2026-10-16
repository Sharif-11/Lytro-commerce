import { bigint, customType, index, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { createdAt, tenant } from '../shared';

// LIF-16/17: a zip of the owner's own data, generated asynchronously and downloadable for 24 hours after
// it's ready. `fileContent` holds the actual bytes -- no object storage (R2/S3) exists in this codebase yet
// (that's MED-*'s Phase 3 scope), so the file lives directly in Postgres rather than inventing that
// infrastructure early for one feature. Deleted at day 60 alongside the rest of the tenant's business data
// (LIF-19).
const bytea = customType<{ data: Buffer }>({
  dataType: () => 'bytea',
});

export const dataExports = tenant.table(
  'data_exports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    status: text('status').notNull().default('pending'), // pending | ready | failed
    fileContent: bytea('file_content'),
    fileSizeBytes: bigint('file_size_bytes', { mode: 'number' }),
    contentType: text('content_type'),
    failureReason: text('failure_reason'),
    requestedAt: createdAt(),
    readyAt: timestamp('ready_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
  },
  (t) => [index('data_exports_tenant_requested_idx').on(t.tenantId, t.requestedAt)],
);

export type SelectDataExport = typeof dataExports.$inferSelect;
export type InsertDataExport = typeof dataExports.$inferInsert;
