import { and, asc, eq, inArray, isNotNull, isNull, lt, max, sql } from 'drizzle-orm';
import type { TutorialScreen } from '@lytronix/validators';
import type { Executor, Transaction } from '../../transactions';
import {
  orders,
  tutorialDismissals,
  tutorialVideos,
  tutorialViews,
  type InsertTutorialVideo,
  type SelectTutorialVideo,
} from '../../schema';

/** A file replaced or removed long enough ago to delete. */
export interface TutorialOldFiles {
  id: string;
  videoKey: string;
  coverKey: string;
}

/**
 * TENANT-DASHBOARD-DESIGN §7.49, OPERATOR-CONSOLE-DESIGN §10h: the tutorial videos' files (Lytro's own rows) and what each
 * shop person did with them (the shop's rows, held to the shop the transaction names by row-level security).
 */
export class TutorialRepository {
  /** Every part's live file. */
  live(db: Executor): Promise<SelectTutorialVideo[]> {
    return db
      .select()
      .from(tutorialVideos)
      .where(and(isNotNull(tutorialVideos.publishedAt), isNull(tutorialVideos.retiredAt)))
      .orderBy(asc(tutorialVideos.tutorialKey));
  }

  /** One upload, replacement or removal of a part at a time, until the transaction ends. */
  async lockPart(tx: Transaction, tutorialKey: string): Promise<void> {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`tutorial:${tutorialKey}`}))`);
  }

  async liveOf(tx: Transaction, tutorialKey: string): Promise<SelectTutorialVideo | null> {
    const [row] = await tx
      .select()
      .from(tutorialVideos)
      .where(
        and(
          eq(tutorialVideos.tutorialKey, tutorialKey),
          isNotNull(tutorialVideos.publishedAt),
          isNull(tutorialVideos.retiredAt),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  /** The version the part's next upload is saved as: one past every version it ever had, removed ones too. */
  async nextVersions(db: Executor): Promise<Map<string, number>> {
    const rows = await db
      .select({ key: tutorialVideos.tutorialKey, version: max(tutorialVideos.version) })
      .from(tutorialVideos)
      .groupBy(tutorialVideos.tutorialKey);
    return new Map(rows.map((row) => [row.key, (row.version ?? 0) + 1]));
  }

  /** An upload's own version, claimed before its files are sent: one past every version the part ever had. */
  async claim(
    tx: Transaction,
    row: Omit<InsertTutorialVideo, 'version' | 'videoKey' | 'coverKey'>,
    keysOf: (version: number) => { videoKey: string; coverKey: string },
  ): Promise<SelectTutorialVideo> {
    await this.lockPart(tx, row.tutorialKey);
    const [top] = await tx
      .select({ version: max(tutorialVideos.version) })
      .from(tutorialVideos)
      .where(eq(tutorialVideos.tutorialKey, row.tutorialKey));
    const version = (top?.version ?? 0) + 1;
    const [inserted] = await tx
      .insert(tutorialVideos)
      .values({ ...row, version, ...keysOf(version) })
      .returning();
    if (!inserted) throw new Error('tutorial video insert returned no row');
    return inserted;
  }

  async publish(tx: Transaction, id: string, at: Date): Promise<void> {
    await tx
      .update(tutorialVideos)
      .set({ publishedAt: at })
      .where(and(eq(tutorialVideos.id, id), isNull(tutorialVideos.retiredAt)));
  }

  /** Uploads claimed before `before` that never went live: retired, so their files go with the others'. */
  async retireUnfinished(tx: Transaction, before: Date, at: Date): Promise<number> {
    const rows = await tx
      .update(tutorialVideos)
      .set({ retiredAt: at })
      .where(
        and(
          isNull(tutorialVideos.publishedAt),
          isNull(tutorialVideos.retiredAt),
          lt(tutorialVideos.uploadedAt, before),
        ),
      )
      .returning({ id: tutorialVideos.id });
    return rows.length;
  }

  async retire(tx: Transaction, id: string, at: Date, by: string | null): Promise<void> {
    await tx
      .update(tutorialVideos)
      .set({ retiredAt: at, retiredBy: by })
      .where(and(eq(tutorialVideos.id, id), isNull(tutorialVideos.retiredAt)));
  }

  /** Files retired before `before` and not deleted yet, oldest first. */
  oldFiles(db: Executor, before: Date, limit: number): Promise<TutorialOldFiles[]> {
    return db
      .select({
        id: tutorialVideos.id,
        videoKey: tutorialVideos.videoKey,
        coverKey: tutorialVideos.coverKey,
      })
      .from(tutorialVideos)
      .where(
        and(
          isNotNull(tutorialVideos.retiredAt),
          lt(tutorialVideos.retiredAt, before),
          isNull(tutorialVideos.filesDeletedAt),
        ),
      )
      .orderBy(asc(tutorialVideos.retiredAt))
      .limit(limit);
  }

  async markFilesDeleted(tx: Transaction, ids: readonly string[], at: Date): Promise<void> {
    if (ids.length === 0) return;
    await tx
      .update(tutorialVideos)
      .set({ filesDeletedAt: at })
      .where(inArray(tutorialVideos.id, [...ids]));
  }

  // ---------- the shop's own rows (row-level security) ----------

  async watched(tx: Transaction, tenantId: string, userId: string): Promise<string[]> {
    const rows = await tx
      .select({ key: tutorialViews.tutorialKey })
      .from(tutorialViews)
      .where(and(eq(tutorialViews.tenantId, tenantId), eq(tutorialViews.userId, userId)));
    return rows.map((row) => row.key);
  }

  /** The first time counts; watching again changes nothing. */
  async markWatched(
    tx: Transaction,
    tenantId: string,
    userId: string,
    tutorialKey: string,
  ): Promise<void> {
    await tx.insert(tutorialViews).values({ tenantId, userId, tutorialKey }).onConflictDoNothing();
  }

  async dismissed(tx: Transaction, tenantId: string, userId: string): Promise<TutorialScreen[]> {
    const rows = await tx
      .select({ screen: tutorialDismissals.screen })
      .from(tutorialDismissals)
      .where(and(eq(tutorialDismissals.tenantId, tenantId), eq(tutorialDismissals.userId, userId)));
    return rows.map((row) => row.screen);
  }

  async dismiss(
    tx: Transaction,
    tenantId: string,
    userId: string,
    screen: TutorialScreen,
  ): Promise<void> {
    await tx.insert(tutorialDismissals).values({ tenantId, userId, screen }).onConflictDoNothing();
  }

  /** §7.49a: whether the shop has had any order yet, in any state. */
  async hasOrder(tx: Transaction, tenantId: string): Promise<boolean> {
    const [row] = await tx
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.tenantId, tenantId))
      .limit(1);
    return row !== undefined;
  }
}
