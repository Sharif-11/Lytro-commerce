import {
  and,
  asc,
  count,
  countDistinct,
  desc,
  eq,
  inArray,
  isNull,
  lt,
  or,
  sql,
} from 'drizzle-orm';
import { MediaStatus, type MediaKind, type MediaPurpose } from '@lytronix/validators';
import {
  attributeOptions,
  brandIdentities,
  categories,
  media,
  mediaObjects,
  mediaReconciliations,
  orderLines,
  productImages,
  products,
  shopSettings,
  sizeCharts,
  type InsertMedia,
  type InsertMediaObject,
  type InsertMediaReconciliation,
  type SelectMedia,
  type SelectMediaObject,
} from '../../schema';
import type { Executor, Transaction, TransactionRunner } from '../../transactions';

/** A new item, its upload link about to be given out. */
export type NewMedia = Omit<
  InsertMedia,
  | 'tenantId'
  | 'status'
  | 'createdAt'
  | 'readyAt'
  | 'width'
  | 'height'
  | 'durationMs'
  | 'hash'
  | 'failure'
>;

/** A stored file of an item. */
export type NewMediaObject = Omit<InsertMediaObject, 'id' | 'tenantId' | 'createdAt'>;

/** What an item finished as: ready, with its picture's size, a video's length, and its fingerprint; or refused and why. */
export type MediaOutcome =
  | {
      status: MediaStatus.Ready;
      width: number;
      height: number;
      durationMs: number | null;
      hash: string;
    }
  | { status: MediaStatus.Failed; failure: string };

/** MED-09: the places an item is attached, counted, so its deletion can say what it leaves. */
export interface MediaUses {
  products: number;
  /** PRD-11: products showing it as their video. */
  videos: number;
  categories: number;
  swatches: number;
  sizeCharts: number;
  logo: boolean;
  /** ORD-46, ORD-47: past orders whose items show it; they keep their other details when it goes. */
  pastOrders: number;
  /** BRN-02: the brand identity shows it, as its logo for dark backgrounds or its square icon (KNOWN-GAPS §97). */
  brand: boolean;
}

/** STO-01, STO-09: what an item takes from the shop's storage, every file of it, and a video's length. */
export interface MediaSize {
  id: string;
  bytes: number;
  durationMs: number | null;
}

/** PRD-11: one photo of a product, in its place, with its stored files. */
export interface ProductImageRow {
  productId: string;
  mediaId: string;
  sortOrder: number;
}

// MED-03, MED-04, STO-01, PRD-11: a shop's media and where it is attached. Every method sets the shop's tenant context.
// The database keeps an item moving only forward, its files written only while it is processing, and anything
// attached a ready image of the shop's own.
export class MediaRepository {
  constructor(private readonly transactions: TransactionRunner) {}

  async insertMedia(tx: Transaction, tenantId: string, row: NewMedia): Promise<SelectMedia> {
    await this.transactions.setTenantContext(tx, tenantId);
    const [made] = await tx
      .insert(media)
      .values({ tenantId, ...row })
      .returning();
    if (!made) throw new Error('insert returned no media row');
    return made;
  }

  async findMedia(tx: Transaction, tenantId: string, id: string): Promise<SelectMedia | null> {
    await this.transactions.setTenantContext(tx, tenantId);
    const rows = await tx
      .select()
      .from(media)
      .where(and(eq(media.tenantId, tenantId), eq(media.id, id)))
      .limit(1);
    return rows[0] ?? null;
  }

  async lockMedia(tx: Transaction, tenantId: string, id: string): Promise<SelectMedia | null> {
    await this.transactions.setTenantContext(tx, tenantId);
    const rows = await tx
      .select()
      .from(media)
      .where(and(eq(media.tenantId, tenantId), eq(media.id, id)))
      .for('update');
    return rows[0] ?? null;
  }

  /** MED-03: the file was sent; it is processing now. False when the item had already moved on. */
  async markProcessing(tx: Transaction, tenantId: string, id: string): Promise<boolean> {
    await this.transactions.setTenantContext(tx, tenantId);
    const rows = await tx
      .update(media)
      .set({ status: MediaStatus.Processing })
      .where(
        and(
          eq(media.tenantId, tenantId),
          eq(media.id, id),
          eq(media.status, MediaStatus.Uploading),
        ),
      )
      .returning({ id: media.id });
    return rows.length > 0;
  }

  /** MED-03: how the item ended; its temporary upload is gone either way. */
  async finish(
    tx: Transaction,
    tenantId: string,
    id: string,
    outcome: MediaOutcome,
  ): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx
      .update(media)
      .set(
        outcome.status === MediaStatus.Ready
          ? {
              status: outcome.status,
              width: outcome.width,
              height: outcome.height,
              durationMs: outcome.durationMs,
              hash: outcome.hash,
              readyAt: new Date(),
              uploadKey: null,
            }
          : { status: outcome.status, failure: outcome.failure, uploadKey: null },
      )
      .where(and(eq(media.tenantId, tenantId), eq(media.id, id)));
  }

  async insertObjects(tx: Transaction, tenantId: string, rows: NewMediaObject[]): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    if (rows.length === 0) return;
    await tx.insert(mediaObjects).values(rows.map((row) => ({ tenantId, ...row })));
  }

  /** The stored files of these items. */
  async listObjects(
    tx: Transaction,
    tenantId: string,
    mediaIds: string[],
  ): Promise<SelectMediaObject[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    if (mediaIds.length === 0) return [];
    return tx
      .select()
      .from(mediaObjects)
      .where(and(eq(mediaObjects.tenantId, tenantId), inArray(mediaObjects.mediaId, mediaIds)));
  }

  /** STO-01, STO-09: the bytes each of these items stores, every file of it, and a video's length. */
  async sizesOf(tx: Transaction, tenantId: string, ids: string[]): Promise<MediaSize[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    if (ids.length === 0) return [];
    const rows = await tx
      .select({
        id: media.id,
        durationMs: media.durationMs,
        bytes: sql<string>`coalesce(sum(${mediaObjects.bytes}), 0)::text`,
      })
      .from(media)
      .leftJoin(
        mediaObjects,
        and(eq(mediaObjects.tenantId, media.tenantId), eq(mediaObjects.mediaId, media.id)),
      )
      .where(and(eq(media.tenantId, tenantId), inArray(media.id, ids)))
      .groupBy(media.id);
    return rows.map((row) => ({
      id: row.id,
      bytes: Number(row.bytes),
      durationMs: row.durationMs,
    }));
  }

  /** STO-01, STO-02: the bytes the shop stores now, every file of every item. */
  async storedBytes(tx: Transaction, tenantId: string): Promise<number> {
    await this.transactions.setTenantContext(tx, tenantId);
    const [row] = await tx
      .select({ bytes: sql<string>`coalesce(sum(${mediaObjects.bytes}), 0)::text` })
      .from(mediaObjects)
      .where(eq(mediaObjects.tenantId, tenantId));
    return Number(row?.bytes ?? 0);
  }

  /** STO-03: one writer at a time checks the shop's storage against its limit, so two uploads cannot both squeeze in. */
  async lockStorage(tx: Transaction, tenantId: string): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${`media:${tenantId}`}, 0))`,
    );
  }

  /** MED-08: which of these items are ready media of this kind, with the fingerprint their links are named by. */
  async readyMedia(
    tx: Transaction,
    tenantId: string,
    ids: string[],
    kind: MediaKind,
  ): Promise<{ id: string; hash: string }[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    if (ids.length === 0) return [];
    const rows = await tx
      .select({ id: media.id, hash: media.hash })
      .from(media)
      .where(
        and(
          eq(media.tenantId, tenantId),
          inArray(media.id, ids),
          eq(media.status, MediaStatus.Ready),
          eq(media.kind, kind),
        ),
      );
    return rows.flatMap((row) => (row.hash === null ? [] : [{ id: row.id, hash: row.hash }]));
  }

  /** MED-09: the shop's ready media, newest first. */
  async listReady(
    tx: Transaction,
    tenantId: string,
    filter: { kind: MediaKind | null; offset: number; limit: number },
  ): Promise<{ rows: SelectMedia[]; total: number }> {
    await this.transactions.setTenantContext(tx, tenantId);
    const where = and(
      eq(media.tenantId, tenantId),
      eq(media.status, MediaStatus.Ready),
      filter.kind !== null ? eq(media.kind, filter.kind) : undefined,
    );
    const [rows, totals] = await Promise.all([
      tx
        .select()
        .from(media)
        .where(where)
        .orderBy(desc(media.createdAt), desc(media.id))
        .offset(filter.offset)
        .limit(filter.limit),
      tx.select({ total: count() }).from(media).where(where),
    ]);
    return { rows, total: totals[0]?.total ?? 0 };
  }

  /** MED-09: where the item is attached. */
  async usesOf(tx: Transaction, tenantId: string, id: string): Promise<MediaUses> {
    await this.transactions.setTenantContext(tx, tenantId);
    const counted = async (query: Promise<{ n: number }[]>): Promise<number> =>
      (await query)[0]?.n ?? 0;
    const [photos, videos, cats, swatches, charts, logos, pastOrders, brands] = await Promise.all([
      counted(
        tx
          .select({ n: count() })
          .from(productImages)
          .where(and(eq(productImages.tenantId, tenantId), eq(productImages.mediaId, id))),
      ),
      counted(
        tx
          .select({ n: count() })
          .from(products)
          .where(and(eq(products.tenantId, tenantId), eq(products.videoId, id))),
      ),
      counted(
        tx
          .select({ n: count() })
          .from(categories)
          .where(and(eq(categories.tenantId, tenantId), eq(categories.imageId, id))),
      ),
      counted(
        tx
          .select({ n: count() })
          .from(attributeOptions)
          .where(
            and(eq(attributeOptions.tenantId, tenantId), eq(attributeOptions.swatchImageId, id)),
          ),
      ),
      counted(
        tx
          .select({ n: count() })
          .from(sizeCharts)
          .where(and(eq(sizeCharts.tenantId, tenantId), eq(sizeCharts.imageId, id))),
      ),
      counted(
        tx
          .select({ n: count() })
          .from(shopSettings)
          .where(and(eq(shopSettings.tenantId, tenantId), eq(shopSettings.logoMediaId, id))),
      ),
      counted(
        tx
          .select({ n: countDistinct(orderLines.orderId) })
          .from(orderLines)
          .where(and(eq(orderLines.tenantId, tenantId), eq(orderLines.thumbnailMediaId, id))),
      ),
      counted(
        tx
          .select({ n: count() })
          .from(brandIdentities)
          .where(
            and(
              eq(brandIdentities.tenantId, tenantId),
              or(eq(brandIdentities.darkLogoMediaId, id), eq(brandIdentities.iconMediaId, id)),
            ),
          ),
      ),
    ]);
    return {
      products: photos,
      videos,
      categories: cats,
      swatches,
      sizeCharts: charts,
      logo: logos > 0,
      pastOrders,
      brand: brands > 0,
    };
  }

  /**
   * MED-09: deletes the item and its file rows; it leaves every place it was attached (the database clears or removes
   * them). The keys of its stored files, for the deletion job.
   */
  async deleteMedia(tx: Transaction, tenantId: string, id: string): Promise<string[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    const keys = await tx
      .select({ key: mediaObjects.key })
      .from(mediaObjects)
      .where(and(eq(mediaObjects.tenantId, tenantId), eq(mediaObjects.mediaId, id)));
    await tx.delete(media).where(and(eq(media.tenantId, tenantId), eq(media.id, id)));
    return keys.map((row) => row.key);
  }

  /** PRD-11: these products' photos, in order. */
  async listProductImages(
    tx: Transaction,
    tenantId: string,
    productIds: string[],
  ): Promise<ProductImageRow[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    if (productIds.length === 0) return [];
    return tx
      .select({
        productId: productImages.productId,
        mediaId: productImages.mediaId,
        sortOrder: productImages.sortOrder,
      })
      .from(productImages)
      .where(
        and(eq(productImages.tenantId, tenantId), inArray(productImages.productId, productIds)),
      )
      .orderBy(asc(productImages.productId), asc(productImages.sortOrder));
  }

  /** PRD-11: the product's photos become these, in this order. */
  async setProductImages(
    tx: Transaction,
    tenantId: string,
    productId: string,
    mediaIds: string[],
  ): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx
      .delete(productImages)
      .where(and(eq(productImages.tenantId, tenantId), eq(productImages.productId, productId)));
    if (mediaIds.length === 0) return;
    await tx
      .insert(productImages)
      .values(mediaIds.map((mediaId, sortOrder) => ({ tenantId, productId, mediaId, sortOrder })));
  }

  /** PRD-11: how many photos the product shows now. */
  async countProductImages(tx: Transaction, tenantId: string, productId: string): Promise<number> {
    await this.transactions.setTenantContext(tx, tenantId);
    const [row] = await tx
      .select({ n: count() })
      .from(productImages)
      .where(and(eq(productImages.tenantId, tenantId), eq(productImages.productId, productId)));
    return row?.n ?? 0;
  }

  /**
   * MED-04: uploads started before this time and never finished. Their links expired long ago and the temporary bucket
   * clears their files itself, so the rows go; they stored and counted nothing.
   */
  async deleteAbandoned(tx: Transaction, tenantId: string, before: Date): Promise<number> {
    await this.transactions.setTenantContext(tx, tenantId);
    const rows = await tx
      .delete(media)
      .where(
        and(
          eq(media.tenantId, tenantId),
          eq(media.status, MediaStatus.Uploading),
          lt(media.createdAt, before),
        ),
      )
      .returning({ id: media.id });
    return rows.length;
  }

  /**
   * MED-04, STO-09: items started before this time and still processing -- their job gave up -- are refused, so the shop
   * can be told and try again. The items, as they were.
   */
  async failStuck(
    tx: Transaction,
    tenantId: string,
    before: Date,
    failure: string,
  ): Promise<{ id: string; kind: MediaKind; purpose: MediaPurpose }[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    return tx
      .update(media)
      .set({ status: MediaStatus.Failed, failure, uploadKey: null })
      .where(
        and(
          eq(media.tenantId, tenantId),
          eq(media.status, MediaStatus.Processing),
          lt(media.createdAt, before),
        ),
      )
      .returning({ id: media.id, kind: media.kind, purpose: media.purpose });
  }

  /** MED-04: every file the shop's rows record, for the nightly comparison with R2. */
  async listRecordedFiles(
    tx: Transaction,
    tenantId: string,
  ): Promise<{ key: string; bytes: number }[]> {
    await this.transactions.setTenantContext(tx, tenantId);
    return tx
      .select({ key: mediaObjects.key, bytes: mediaObjects.bytes })
      .from(mediaObjects)
      .where(eq(mediaObjects.tenantId, tenantId));
  }

  /** MED-04: what one night's comparison found for a shop whose rows and R2 differ. */
  async insertReconciliation(
    db: Executor,
    row: Omit<InsertMediaReconciliation, 'id' | 'createdAt'>,
  ): Promise<void> {
    await db.insert(mediaReconciliations).values(row);
  }

  /** MED-03: whether an upload's place exists: a live product of the shop's, a category, or one of its own options. */
  async targetExists(
    tx: Transaction,
    tenantId: string,
    target: { kind: 'product' | 'category' | 'option'; id: string },
  ): Promise<boolean> {
    await this.transactions.setTenantContext(tx, tenantId);
    const found =
      target.kind === 'product'
        ? await tx
            .select({ id: products.id })
            .from(products)
            .where(
              and(
                eq(products.tenantId, tenantId),
                eq(products.id, target.id),
                isNull(products.deletedAt),
              ),
            )
            .limit(1)
        : target.kind === 'category'
          ? await tx
              .select({ id: categories.id })
              .from(categories)
              .where(and(eq(categories.tenantId, tenantId), eq(categories.id, target.id)))
              .limit(1)
          : await tx
              .select({ id: attributeOptions.id })
              .from(attributeOptions)
              .where(
                and(eq(attributeOptions.tenantId, tenantId), eq(attributeOptions.id, target.id)),
              )
              .limit(1);
    return found.length > 0;
  }

  /** LIF-19: a lapsed shop's media rows and their nightly findings, at day 60; its stored files go by its prefix. */
  async deleteAllForTenant(tx: Transaction, tenantId: string): Promise<void> {
    await this.transactions.setTenantContext(tx, tenantId);
    await tx.delete(media).where(eq(media.tenantId, tenantId));
    await tx.delete(mediaReconciliations).where(eq(mediaReconciliations.tenantId, tenantId));
  }
}
