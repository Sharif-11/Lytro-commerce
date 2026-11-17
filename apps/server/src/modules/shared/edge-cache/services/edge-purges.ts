import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Transaction } from '@lytronix/db';
import {
  EDGE_TAG_EVERY,
  listingEdgeTag,
  productEdgeTag,
  QueueName,
  shopEdgeTag,
} from '@lytronix/validators';
import type { JobQueue } from '../../queue/ports/job-queue';
import { JOB_QUEUE } from '../../queue/tokens';
import type { EdgePurgeStore } from '../ports/edge-purge-store';
import { EDGE_PURGE_STORE } from '../tokens';
import type { EdgePurgeJob } from '../types/edge-purge-job';

/**
 * D9-32 (Slice 9.10): asks Cloudflare to drop the shop pages it keeps whose content a change alters. Queued in the
 * caller's own transaction (SCL-08), so a purge is sent only for a change that was saved, and only after it was: a page
 * built again before the commit would be kept with the old content. The job drops the pages by the tags the storefront
 * wrote on them (`@lytronix/validators`' edge-cache-tags): one product's, a shop's listings, a shop's every page, or
 * every shop's.
 */
@Injectable()
export class EdgePurges {
  private readonly logger = new Logger('EdgePurges');

  constructor(
    @Inject(JOB_QUEUE) private readonly jobs: JobQueue,
    @Inject(EDGE_PURGE_STORE) private readonly store: EdgePurgeStore,
  ) {}

  /** What one product's pages, cards and estimates show changed: its price, name, photos, sizes or stock state. */
  products(tx: Transaction, _tenantId: string, productIds: readonly string[]): Promise<void> {
    return this.enqueue(tx, productIds.map(productEdgeTag));
  }

  /** Which products the shop's lists show changed (one made, archived, restored, shown, hidden or moved), and those. */
  async listing(
    tx: Transaction,
    tenantId: string,
    productIds: readonly string[] = [],
  ): Promise<void> {
    const slug = await this.store.slugOf(tx, tenantId);
    const tags = productIds.map(productEdgeTag);
    await this.enqueue(tx, slug === null ? tags : [listingEdgeTag(slug), ...tags]);
  }

  /** What every page of the shop shows changed: its details, logo, colours, categories, zones or state. */
  async shop(tx: Transaction, tenantId: string): Promise<void> {
    const slug = await this.store.slugOf(tx, tenantId);
    if (slug !== null) await this.enqueue(tx, [shopEdgeTag(slug)]);
  }

  /** What every shop's pages show changed (the platform's attribute library). */
  everything(tx: Transaction): Promise<void> {
    return this.enqueue(tx, [EDGE_TAG_EVERY]);
  }

  /**
   * `shop` for a change already committed in a transaction of its own (a shop's settings, its state, its domain). Never
   * fails the change: a purge not queued leaves the shop's kept pages to run out within their 5 minutes.
   */
  async shopLater(tenantId: string): Promise<void> {
    try {
      await this.store.run((tx) => this.shop(tx, tenantId));
    } catch (error) {
      this.logger.warn(
        `shop ${tenantId}'s pages were not queued for purging: ${error instanceof Error ? error.name : 'failed'}`,
      );
    }
  }

  private async enqueue(tx: Transaction, tags: readonly string[]): Promise<void> {
    if (tags.length === 0) return;
    const job: EdgePurgeJob = { tags: [...new Set(tags)], at: Date.now() };
    await this.jobs.enqueue(tx, QueueName.EdgePurge, job);
  }
}
