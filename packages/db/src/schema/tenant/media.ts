import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  foreignKey,
  index,
  integer,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import {
  enumTuple,
  MediaKind,
  MediaObjectRole,
  MediaPurpose,
  MediaStatus,
} from '@lytronix/validators';
import { createdAt, tenant } from '../shared';
import { products } from './catalogue';

export const mediaKind = tenant.enum('media_kind', enumTuple(Object.values(MediaKind)));
export const mediaStatus = tenant.enum('media_status', enumTuple(Object.values(MediaStatus)));
export const mediaPurpose = tenant.enum('media_purpose', enumTuple(Object.values(MediaPurpose)));
export const mediaObjectRole = tenant.enum(
  'media_object_role',
  enumTuple(Object.values(MediaObjectRole)),
);

// MED-03, MED-04, STO-01: one uploaded item, from the moment its upload link is given out. While uploading or
// processing it stores and counts nothing; once ready, its stored files are its `media_objects`; a refused one keeps
// why (`failure`) and nothing else. What it was uploaded for, and the place named, are kept for the record; once ready
// it may be attached anywhere of its kind.
export const media = tenant.table(
  'media',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    kind: mediaKind('kind').notNull(),
    status: mediaStatus('status').notNull().default(MediaStatus.Uploading),
    purpose: mediaPurpose('purpose').notNull(),
    targetId: uuid('target_id'),
    // The temporary upload's key, until it is processed.
    uploadKey: text('upload_key'),
    // What the browser said it was sending; what it really is, is judged from its content.
    contentType: varchar('content_type', { length: 100 }).notNull(),
    declaredBytes: bigint('declared_bytes', { mode: 'number' }).notNull(),
    width: integer('width'),
    height: integer('height'),
    durationMs: integer('duration_ms'),
    // MED-08: the fingerprint in its public name.
    hash: varchar('hash', { length: 64 }),
    failure: text('failure'),
    createdBy: uuid('created_by'),
    createdAt: createdAt(),
    readyAt: timestamp('ready_at', { withTimezone: true }),
  },
  (t) => [
    unique('media_tenant_id_key').on(t.tenantId, t.id),
    index('media_tenant_created_idx').on(t.tenantId, t.createdAt.desc(), t.id.desc()),
    index('media_tenant_status_idx').on(t.tenantId, t.status),
    check('media_declared_bytes_check', sql`${t.declaredBytes} > 0`),
    check(
      'media_ready_check',
      sql`(${t.status} = 'ready') = (${t.readyAt} IS NOT NULL AND ${t.hash} IS NOT NULL)`,
    ),
  ],
);

// MED-01, MED-04, STO-01: one stored file of an item, with its exact size; a shop's storage use is the sum of its rows.
// Every key is under the shop's own prefix. A row goes with its item.
export const mediaObjects = tenant.table(
  'media_objects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    mediaId: uuid('media_id').notNull(),
    role: mediaObjectRole('role').notNull(),
    key: text('key').notNull(),
    bytes: bigint('bytes', { mode: 'number' }).notNull(),
    contentType: varchar('content_type', { length: 100 }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique('media_objects_key_key').on(t.key),
    uniqueIndex('media_objects_media_role_idx').on(t.tenantId, t.mediaId, t.role),
    foreignKey({
      name: 'media_objects_media_fk',
      columns: [t.tenantId, t.mediaId],
      foreignColumns: [media.tenantId, media.id],
    }).onDelete('cascade'),
    check('media_objects_bytes_check', sql`${t.bytes} >= 0`),
    check(
      'media_objects_prefix_check',
      sql`${t.key} LIKE 'tenants/' || ${t.tenantId}::text || '/%'`,
    ),
  ],
);

// PRD-11: a product's photos, in the order shown. A photo goes from the product when it is deleted.
export const productImages = tenant.table(
  'product_images',
  {
    tenantId: uuid('tenant_id').notNull(),
    productId: uuid('product_id').notNull(),
    mediaId: uuid('media_id').notNull(),
    sortOrder: integer('sort_order').notNull(),
  },
  (t) => [
    primaryKey({ name: 'product_images_pkey', columns: [t.tenantId, t.productId, t.mediaId] }),
    uniqueIndex('product_images_order_idx').on(t.tenantId, t.productId, t.sortOrder),
    index('product_images_media_idx').on(t.tenantId, t.mediaId),
    foreignKey({
      name: 'product_images_product_fk',
      columns: [t.tenantId, t.productId],
      foreignColumns: [products.tenantId, products.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'product_images_media_fk',
      columns: [t.tenantId, t.mediaId],
      foreignColumns: [media.tenantId, media.id],
    }).onDelete('cascade'),
    check('product_images_order_check', sql`${t.sortOrder} >= 0`),
  ],
);

export type SelectMedia = typeof media.$inferSelect;
export type InsertMedia = typeof media.$inferInsert;
export type SelectMediaObject = typeof mediaObjects.$inferSelect;
export type InsertMediaObject = typeof mediaObjects.$inferInsert;
