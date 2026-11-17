import { Logger, Module } from '@nestjs/common';
import type { Env } from '../../../config/env';
import { ENV } from '../../../config/tokens';
import { DrizzleEdgePurgeStore } from '../../../database/adapters/edge-cache.adapter';
import { OutsideCalls } from '../outside-calls/services/outside-calls';
import { QueueModule } from '../queue/queue.module';
import type { EdgeCache } from './ports/edge-cache';
import { CloudflareEdgeCache } from './providers/cloudflare-edge-cache';
import { UnconfiguredEdgeCache } from './providers/unconfigured-edge-cache';
import { EdgePurgeRunner, REAL_PURGE_TIMING } from './services/edge-purge-runner';
import { EdgePurges } from './services/edge-purges';
import { EDGE_CACHE, EDGE_PURGE_STORE, EDGE_PURGE_TIMING } from './tokens';

/**
 * D9-31, D9-32: Cloudflare's cache in front of public media and shops' pages, purged through its API when the token and
 * the zone are both set; else nothing is kept in front of Lytro, so nothing needs purging.
 */
function edgeCache(env: Env, outside: OutsideCalls): EdgeCache {
  const apiToken = env.CLOUDFLARE_API_TOKEN;
  const zoneId = env.CLOUDFLARE_ZONE_ID;
  if (!apiToken || !zoneId) {
    // A server with Cloudflare's token but no zone would leave changed pages and a deleted shop's files in its cache.
    if (apiToken) {
      new Logger('EdgeCache').warn(
        "CLOUDFLARE_ZONE_ID is not set: shops' changed pages and a deleted shop's media stay in Cloudflare's cache",
      );
    }
    return new UnconfiguredEdgeCache();
  }
  return new CloudflareEdgeCache(
    { apiToken, zoneId, mediaBaseUrl: env.MEDIA_PUBLIC_BASE_URL ?? null },
    undefined,
    outside.breaker('cloudflare'),
  );
}

// D9-32: purging Cloudflare's copies, as a leaf over the job queue, so any module whose change alters a shop's pages can
// queue a purge without an import cycle. The worker that sends them is queue-workers' (EdgePurgeWorker).
@Module({
  imports: [QueueModule],
  providers: [
    { provide: EDGE_CACHE, inject: [ENV, OutsideCalls], useFactory: edgeCache },
    { provide: EDGE_PURGE_STORE, useClass: DrizzleEdgePurgeStore },
    { provide: EDGE_PURGE_TIMING, useValue: REAL_PURGE_TIMING },
    EdgePurges,
    EdgePurgeRunner,
  ],
  exports: [EDGE_CACHE, EdgePurges, EdgePurgeRunner],
})
export class EdgeCacheModule {}
