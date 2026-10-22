import { Inject, Injectable } from '@nestjs/common';
import {
  AddonPurchaseRepository,
  BrandIdentityRepository,
  MediaRepository,
  TenantRepository,
  TransactionRunner,
  type SelectBrandIdentity,
  type Transaction,
} from '@lytronix/db';
import { MediaKind, MediaStatus } from '@lytronix/validators';
import { MediaNotAttachable } from '../../common/errors/media-refused';
import type { BrandStore } from '../../modules/brand/ports/brand-store';
import type {
  BrandHoldings,
  BrandRecord,
  BrandValues,
  ImageSize,
} from '../../modules/brand/types/brand';
import { DatabaseService } from '../database.service';
import { MEDIA_READY_IMAGE } from './media.adapter';

function recordOf(row: SelectBrandIdentity): BrandRecord {
  return {
    useBrand: row.useBrand,
    mainColor: row.mainColor,
    accentColor: row.accentColor,
    backgroundColor: row.backgroundColor,
    headingFont: row.headingFont,
    bodyFont: row.bodyFont,
    corners: row.corners,
    spacing: row.spacing,
    darkLogoMediaId: row.darkLogoMediaId,
    iconMediaId: row.iconMediaId,
    updatedAt: row.updatedAt,
  };
}

/** tenant.brand_identities, the shop's plan features and add-ons, and its images' sizes (BRN-02, BRN-05). */
@Injectable()
export class DrizzleBrandStore implements BrandStore {
  constructor(
    @Inject(DatabaseService) private readonly database: Pick<DatabaseService, 'handle'>,
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(BrandIdentityRepository) private readonly brands: BrandIdentityRepository,
    @Inject(TenantRepository) private readonly tenants: TenantRepository,
    @Inject(AddonPurchaseRepository) private readonly addonPurchases: AddonPurchaseRepository,
    @Inject(MediaRepository) private readonly media: MediaRepository,
  ) {}

  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.transactions.run(this.database.handle.db, work);
  }

  async find(tx: Transaction, tenantId: string): Promise<BrandRecord | null> {
    const row = await this.brands.get(tx, tenantId);
    return row ? recordOf(row) : null;
  }

  async save(tx: Transaction, tenantId: string, values: BrandValues): Promise<BrandRecord> {
    try {
      return recordOf(await this.brands.save(tx, tenantId, values));
    } catch (error) {
      if (this.transactions.isCheckViolation(error, MEDIA_READY_IMAGE)) {
        throw new MediaNotAttachable();
      }
      throw error;
    }
  }

  deleteForTenant(tx: Transaction, tenantId: string): Promise<void> {
    return this.brands.deleteForTenant(tx, tenantId);
  }

  async holdings(tx: Transaction, tenantId: string): Promise<BrandHoldings> {
    const info = await this.tenants.findBillingInfo(tx, tenantId);
    const active = await this.addonPurchases.listActive(tx, tenantId);
    return { features: info?.featureSnapshot ?? null, active };
  }

  async imageSize(tx: Transaction, tenantId: string, mediaId: string): Promise<ImageSize | null> {
    const media = await this.media.findMedia(tx, tenantId, mediaId);
    if (media?.status !== MediaStatus.Ready || media.kind !== MediaKind.Image) return null;
    return { width: media.width, height: media.height };
  }
}
