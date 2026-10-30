import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { SelectCatalogFeed } from '@lytronix/db';
import { AuditAction } from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { CatalogueActivity } from '../../catalogue/services/catalogue-activity';
import type { CatalogueActor } from '../../catalogue/types/catalogue';
import { SecretBox, SecretPurpose, SecretUnreadable } from '../../shared/secrets/secret-box';
import type { CatalogFeedStore } from '../ports/ad-tracking-store';
import { CATALOG_FEED_SETTINGS, CATALOG_FEED_STORE } from '../tokens';
import type { CatalogFeedView } from '../types/public-api';

/** Where a feed is read from and where a shop's pages are, as this server is set up. */
export interface CatalogFeedSettings {
  /** FED-01: the address Meta fetches the feed at, for this token. */
  feedUrl: (token: string) => string;
  /** FED-02, LND-01: the shop's main address: its own domain while that serves, else `<slug>.<PLATFORM_DOMAIN>`. */
  shopOrigin: (slug: string, ownDomain: string | null) => string;
}

// FED-01: a token of 256 random bits (at least 128 are required), written in base64url.
const TOKEN_BYTES = 32;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

function hashOf(token: string): Buffer {
  return createHash('sha256').update(token, 'utf8').digest();
}

/**
 * FED-01, FED-05, FED-06: each shop's Meta catalog feed link. The token is found by its SHA-256 hash, so a copy of the
 * database holds no working link; it is also kept sealed (SEC-10), bound to the shop, so the dashboard can show the
 * link again. A shop's first link is made the first time its dashboard asks; replacing it, which ends the old one at
 * once, is in the activity log.
 */
@Injectable()
export class CatalogFeedService {
  constructor(
    @Inject(CATALOG_FEED_STORE) private readonly store: CatalogFeedStore,
    @Inject(SecretBox) private readonly box: SecretBox,
    @Inject(CatalogueActivity) private readonly activity: CatalogueActivity,
    @Inject(CATALOG_FEED_SETTINGS) private readonly settings: CatalogFeedSettings,
  ) {}

  /** FED-06: the shop's link, made now if it has none. */
  async link(tenantId: string): Promise<CatalogFeedView> {
    const row =
      (await this.store.findForTenant(tenantId)) ??
      (await this.store.insertFirst(this.newToken(tenantId).values));
    return this.viewOf(row);
  }

  /** FED-05: a new link; the old one answers 404 from now on. */
  async regenerate(tenantId: string, actor: CatalogueActor): Promise<CatalogFeedView> {
    const who = await this.activity.resolve(tenantId, actor);
    const { values } = this.newToken(tenantId);
    const row = await this.store.run(async (tx) => {
      const saved = await this.store.replace(tx, values);
      await this.activity.record(
        tx,
        tenantId,
        who,
        AuditAction.CatalogFeedRegenerated,
        { type: 'catalog_feed', id: tenantId },
        {},
      );
      return saved;
    });
    return this.viewOf(row);
  }

  /** FED-01: the shop a feed token belongs to; null for anything else, so every miss looks the same. */
  async tenantOfToken(token: string): Promise<string | null> {
    if (!TOKEN.test(token)) return null;
    return this.store.findByHash(hashOf(token));
  }

  /** LIF-19: the day-60 deletion. */
  deleteAllForTenant(tenantId: string): Promise<void> {
    return this.store.deleteForTenant(tenantId);
  }

  private newToken(tenantId: string): {
    values: { tenantId: string; tokenHash: Buffer; tokenEnc: Buffer };
  } {
    const token = randomBytes(TOKEN_BYTES).toString('base64url');
    return {
      values: {
        tenantId,
        tokenHash: hashOf(token),
        tokenEnc: this.box.seal(token, SecretPurpose.CatalogFeedToken, tenantId),
      },
    };
  }

  /**
   * The link, opened from its sealed copy. A copy no key here opens (the key was replaced without its predecessor
   * kept) is a link the dashboard can no longer show: it still works for Meta until the shop makes a new one.
   */
  private viewOf(row: SelectCatalogFeed): CatalogFeedView {
    let token: string;
    try {
      token = this.box.open(row.tokenEnc, SecretPurpose.CatalogFeedToken, row.tenantId);
    } catch (error) {
      if (error instanceof SecretUnreadable) {
        throw new ApiError('conflict', 'CatalogFeedUnreadable', {});
      }
      throw error;
    }
    return { url: this.settings.feedUrl(token), regeneratedAt: row.rotatedAt };
  }
}
