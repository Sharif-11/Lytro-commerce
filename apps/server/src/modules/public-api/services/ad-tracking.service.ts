import { Inject, Injectable } from '@nestjs/common';
import type { SelectAdTrackingSettings } from '@lytronix/db';
import { AuditAction, type UpdateAdTrackingInput } from '@lytronix/validators';
import { SECOND_MS } from '../../../common/time';
import { CatalogueActivity } from '../../catalogue/services/catalogue-activity';
import type { CatalogueActor } from '../../catalogue/types/catalogue';
import { SecretBox, SecretPurpose } from '../../shared/secrets/secret-box';
import type { AdTrackingStore } from '../ports/ad-tracking-store';
import { AD_TRACKING_STORE } from '../tokens';
import type { AdTrackingView } from '../types/public-api';
import { ExpiringCache } from './expiring-cache';

// The pixel ID the public API answers with is read again at most this often.
const PIXEL_KEPT_MS = 5 * SECOND_MS;
const PIXELS_KEPT = 10_000;

function viewOf(row: SelectAdTrackingSettings | null): AdTrackingView {
  return {
    metaPixelId: row?.metaPixelId ?? null,
    conversionsApiConnected: (row?.metaCapiTokenEnc ?? null) !== null,
    updatedAt: row?.updatedAt ?? null,
  };
}

/**
 * LND-15 to LND-17: a shop's Meta ad tracking. The Pixel ID is public: the landing pages carry it, and the public API
 * answers with it. The Conversions API token is sealed (SEC-10) and bound to the shop, never returned by any route --
 * the dashboard is told only whether one is set -- and opened only when the server sends an event with it (Phase 4).
 * Connecting, changing or removing either is in the activity log, the token by whether it changed, never its value.
 */
@Injectable()
export class AdTrackingService {
  private readonly pixels = new ExpiringCache<string | null>(PIXEL_KEPT_MS, PIXELS_KEPT);

  constructor(
    @Inject(AD_TRACKING_STORE) private readonly store: AdTrackingStore,
    @Inject(SecretBox) private readonly box: SecretBox,
    @Inject(CatalogueActivity) private readonly activity: CatalogueActivity,
  ) {}

  async view(tenantId: string): Promise<AdTrackingView> {
    return viewOf(await this.store.run((tx) => this.store.find(tx, tenantId)));
  }

  /** The Pixel ID, null to disconnect it; the token, left out to keep it, null to remove it. */
  async update(
    tenantId: string,
    input: UpdateAdTrackingInput,
    actor: CatalogueActor,
  ): Promise<AdTrackingView> {
    const who = await this.activity.resolve(tenantId, actor);
    const row = await this.store.run(async (tx) => {
      const current = await this.store.lock(tx, tenantId);
      const pixelFrom = current?.metaPixelId ?? null;
      const hadToken = (current?.metaCapiTokenEnc ?? null) !== null;
      const token = input.conversionsApiToken;
      if (pixelFrom === input.metaPixelId && token === undefined) return current;
      if (pixelFrom === input.metaPixelId && token === null && !hadToken) return current;
      const saved = await this.store.save(tx, {
        tenantId,
        metaPixelId: input.metaPixelId,
        metaCapiTokenEnc:
          token === undefined
            ? (current?.metaCapiTokenEnc ?? null)
            : token === null
              ? null
              : this.box.seal(token, SecretPurpose.ConversionsApiToken, tenantId),
      });
      await this.activity.record(
        tx,
        tenantId,
        who,
        AuditAction.AdTrackingUpdated,
        { type: 'ad_tracking', id: tenantId },
        {
          ...(pixelFrom !== input.metaPixelId
            ? { metaPixelId: { from: pixelFrom, to: input.metaPixelId } }
            : {}),
          ...(token === undefined
            ? {}
            : { conversionsApi: token === null ? 'removed' : hadToken ? 'replaced' : 'connected' }),
        },
      );
      return saved;
    });
    this.pixels.delete(tenantId);
    return viewOf(row);
  }

  /** LND-17: disconnects both; nothing to remove is not an error. */
  async remove(tenantId: string, actor: CatalogueActor): Promise<void> {
    const who = await this.activity.resolve(tenantId, actor);
    await this.store.run(async (tx) => {
      const current = await this.store.lock(tx, tenantId);
      if (!current) return;
      await this.store.delete(tx, tenantId);
      await this.activity.record(
        tx,
        tenantId,
        who,
        AuditAction.AdTrackingRemoved,
        { type: 'ad_tracking', id: tenantId },
        { metaPixelId: current.metaPixelId, conversionsApi: current.metaCapiTokenEnc !== null },
      );
    });
    this.pixels.delete(tenantId);
  }

  /** LND-15: the Pixel ID the public API answers with; this server's own changes show at once. */
  async pixelOf(tenantId: string): Promise<string | null> {
    const now = Date.now();
    const kept = this.pixels.get(tenantId, now);
    if (kept !== undefined) return kept;
    const pixel = (await this.view(tenantId)).metaPixelId;
    this.pixels.set(tenantId, pixel, now);
    return pixel;
  }

  /** LND-16: whether the shop sends its purchases server-side -- a Pixel ID and a Conversions API token both set. */
  async sendsPurchases(tenantId: string): Promise<boolean> {
    const view = await this.view(tenantId);
    return view.metaPixelId !== null && view.conversionsApiConnected;
  }

  /** LND-16: the Pixel ID and the opened token a purchase is sent with, read as it is sent; null once either is gone. */
  async purchaseCredentials(tenantId: string): Promise<{ pixelId: string; token: string } | null> {
    const row = await this.store.run((tx) => this.store.find(tx, tenantId));
    if (!row?.metaPixelId || !row.metaCapiTokenEnc) return null;
    return {
      pixelId: row.metaPixelId,
      token: this.box.open(row.metaCapiTokenEnc, SecretPurpose.ConversionsApiToken, tenantId),
    };
  }

  /** LIF-19: the day-60 deletion. */
  async deleteAllForTenant(tenantId: string): Promise<void> {
    await this.store.run((tx) => this.store.delete(tx, tenantId));
    this.pixels.delete(tenantId);
  }
}
