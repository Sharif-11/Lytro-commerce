import { Inject, Injectable } from '@nestjs/common';
import {
  ApiKeyRepository,
  MediaBandwidthRepository,
  MediaRepository,
  PlanLimitOverridesRepository,
  ShopSettingsRepository,
  TenantRepository,
  TransactionRunner,
  type BandwidthCycleRow,
  type BandwidthDayRow,
  type BillingInfoRow,
  type EdgeShopRow,
  type Transaction,
} from '@lytronix/db';
import type { MediaKind, MediaPurpose, PlanLimits } from '@lytronix/validators';
import { MediaNotAttachable } from '../../common/errors/media-refused';
import type { BandwidthStore, LimitOverrideRow } from '../../modules/media/ports/bandwidth-store';
import type { MediaStore } from '../../modules/media/ports/media-store';
import type {
  MediaObjectRecord,
  MediaOutcome,
  MediaReconciliation,
  MediaRecord,
  MediaUses,
  NewMedia,
  NewMediaObject,
} from '../../modules/media/types/media';
import { DatabaseService } from '../database.service';

// The triggers that keep anything attached a ready image (migration 0065), and a product's video a ready video
// (migration 0066), of the shop's own.
export const MEDIA_READY_IMAGE = 'media_ready_image';
export const MEDIA_READY_VIDEO = 'media_ready_video';

/** tenant.media, tenant.media_objects, where media is attached, and the shop's logo (MED-03, MED-04, TEN-16). */
@Injectable()
export class DrizzleMediaStore implements MediaStore {
  constructor(
    @Inject(DatabaseService) private readonly database: Pick<DatabaseService, 'handle'>,
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(MediaRepository) private readonly media: MediaRepository,
    @Inject(TenantRepository) private readonly tenants: TenantRepository,
    @Inject(PlanLimitOverridesRepository) private readonly overrides: PlanLimitOverridesRepository,
    @Inject(ShopSettingsRepository) private readonly settings: ShopSettingsRepository,
  ) {}

  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.transactions.run(this.database.handle.db, work);
  }

  insertMedia(tx: Transaction, tenantId: string, row: NewMedia): Promise<MediaRecord> {
    return this.media.insertMedia(tx, tenantId, row);
  }

  findMedia(tx: Transaction, tenantId: string, id: string): Promise<MediaRecord | null> {
    return this.media.findMedia(tx, tenantId, id);
  }

  lockMedia(tx: Transaction, tenantId: string, id: string): Promise<MediaRecord | null> {
    return this.media.lockMedia(tx, tenantId, id);
  }

  markProcessing(tx: Transaction, tenantId: string, id: string): Promise<boolean> {
    return this.media.markProcessing(tx, tenantId, id);
  }

  finish(tx: Transaction, tenantId: string, id: string, outcome: MediaOutcome): Promise<void> {
    return this.media.finish(tx, tenantId, id, outcome);
  }

  insertObjects(tx: Transaction, tenantId: string, rows: NewMediaObject[]): Promise<void> {
    return this.media.insertObjects(tx, tenantId, rows);
  }

  listObjects(tx: Transaction, tenantId: string, mediaIds: string[]): Promise<MediaObjectRecord[]> {
    return this.media.listObjects(tx, tenantId, mediaIds);
  }

  storedBytes(tx: Transaction, tenantId: string): Promise<number> {
    return this.media.storedBytes(tx, tenantId);
  }

  lockStorage(tx: Transaction, tenantId: string): Promise<void> {
    return this.media.lockStorage(tx, tenantId);
  }

  async planLimits(
    tx: Transaction,
    tenantId: string,
  ): Promise<{ snapshot: PlanLimits | null; overrides: { limitKey: string; value: unknown }[] }> {
    const [info, overrides] = await Promise.all([
      this.tenants.findBillingInfo(tx, tenantId),
      this.overrides.listForTenant(tx, tenantId),
    ]);
    return { snapshot: info?.planSnapshot ?? null, overrides };
  }

  listReady(
    tx: Transaction,
    tenantId: string,
    filter: { kind: MediaKind | null; offset: number; limit: number },
  ): Promise<{ rows: MediaRecord[]; total: number }> {
    return this.media.listReady(tx, tenantId, filter);
  }

  usesOf(tx: Transaction, tenantId: string, id: string): Promise<MediaUses> {
    return this.media.usesOf(tx, tenantId, id);
  }

  deleteMedia(tx: Transaction, tenantId: string, id: string): Promise<string[]> {
    return this.media.deleteMedia(tx, tenantId, id);
  }

  targetExists(
    tx: Transaction,
    tenantId: string,
    target: { kind: 'product' | 'category' | 'option'; id: string },
  ): Promise<boolean> {
    return this.media.targetExists(tx, tenantId, target);
  }

  async shopLogo(tx: Transaction, tenantId: string): Promise<string | null> {
    return (await this.settings.get(tx, tenantId))?.logoMediaId ?? null;
  }

  async setShopLogo(tx: Transaction, tenantId: string, mediaId: string | null): Promise<void> {
    try {
      await this.settings.setLogo(tx, tenantId, mediaId);
    } catch (error) {
      if (this.transactions.isCheckViolation(error, MEDIA_READY_IMAGE))
        throw new MediaNotAttachable();
      throw error;
    }
  }

  deleteAllForTenant(tx: Transaction, tenantId: string): Promise<void> {
    return this.media.deleteAllForTenant(tx, tenantId);
  }

  listShopIds(): Promise<string[]> {
    return this.tenants.listLiveIds(this.database.handle.db);
  }

  deleteAbandoned(tx: Transaction, tenantId: string, before: Date): Promise<number> {
    return this.media.deleteAbandoned(tx, tenantId, before);
  }

  failStuck(
    tx: Transaction,
    tenantId: string,
    before: Date,
    failure: string,
  ): Promise<{ id: string; kind: MediaKind; purpose: MediaPurpose }[]> {
    return this.media.failStuck(tx, tenantId, before, failure);
  }

  listRecordedFiles(tx: Transaction, tenantId: string): Promise<{ key: string; bytes: number }[]> {
    return this.media.listRecordedFiles(tx, tenantId);
  }

  insertReconciliation(tx: Transaction, row: MediaReconciliation): Promise<void> {
    return this.media.insertReconciliation(tx, row);
  }
}

/**
 * control.media_bandwidth, control.media_bandwidth_daily and control.media_usage_pull (BND-01, BND-02, BND-08), and
 * what the media Worker's shared store is worked out from: every shop, its overrides and its live keys' websites.
 */
@Injectable()
export class DrizzleBandwidthStore implements BandwidthStore {
  constructor(
    @Inject(DatabaseService) private readonly database: Pick<DatabaseService, 'handle'>,
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(MediaBandwidthRepository) private readonly bandwidth: MediaBandwidthRepository,
    @Inject(TenantRepository) private readonly tenants: TenantRepository,
    @Inject(PlanLimitOverridesRepository) private readonly overrides: PlanLimitOverridesRepository,
    @Inject(ApiKeyRepository) private readonly keys: ApiKeyRepository,
  ) {}

  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.transactions.run(this.database.handle.db, work);
  }

  lockPulledUntil(tx: Transaction): Promise<Date> {
    return this.bandwidth.lockPulledUntil(tx);
  }

  setPulledUntil(tx: Transaction, at: Date): Promise<void> {
    return this.bandwidth.setPulledUntil(tx, at);
  }

  add(
    tx: Transaction,
    usage: { tenantId: string; cycleStart: Date; day: string; bytes: number; requests: number },
  ): Promise<BandwidthCycleRow> {
    return this.bandwidth.add(tx, usage);
  }

  setWarned(tx: Transaction, tenantId: string, cycleStart: Date, percent: number): Promise<void> {
    return this.bandwidth.setWarned(tx, tenantId, cycleStart, percent);
  }

  findCycle(tenantId: string, cycleStart: Date): Promise<BandwidthCycleRow | null> {
    return this.bandwidth.findCycle(this.database.handle.db, tenantId, cycleStart);
  }

  listCyclesSince(since: Date): Promise<BandwidthCycleRow[]> {
    return this.bandwidth.listCyclesSince(this.database.handle.db, since);
  }

  listDays(tenantId: string, cycleStart: Date): Promise<BandwidthDayRow[]> {
    return this.bandwidth.listDays(this.database.handle.db, tenantId, cycleStart);
  }

  listEdgeShops(deletedSince: Date): Promise<EdgeShopRow[]> {
    return this.bandwidth.listEdgeShops(this.database.handle.db, deletedSince);
  }

  listOverridesFor(limitKey: string): Promise<LimitOverrideRow[]> {
    return this.overrides.listForKey(this.database.handle.db, limitKey);
  }

  listShopOverrides(tenantId: string): Promise<LimitOverrideRow[]> {
    return this.overrides.listForTenant(this.database.handle.db, tenantId);
  }

  findBillingShop(tenantId: string): Promise<BillingInfoRow | null> {
    return this.tenants.findBillingInfo(this.database.handle.db, tenantId);
  }

  listLiveWebsites(now: Date): Promise<{ tenantId: string; websites: string[] }[]> {
    return this.keys.listLiveWebsites(this.database.handle.db, now);
  }

  deleteAllForTenant(tx: Transaction, tenantId: string): Promise<void> {
    return this.bandwidth.deleteAllForTenant(tx, tenantId);
  }
}
