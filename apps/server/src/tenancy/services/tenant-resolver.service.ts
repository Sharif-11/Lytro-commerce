import { Inject, Injectable } from '@nestjs/common';
import type { TenantState } from '@lytronix/db';
import { HostClassifier } from './host-classifier';
import { TenantCache, type CachedTenant } from './tenant-cache';
import { TENANT_DIRECTORY } from '../tokens';

// Where the database lookups come from. The Drizzle implementation lives in database/adapters, so this service
// can be tested with a fake.
export interface TenantDirectory {
  findBySlug(slug: string): Promise<CachedTenant | null>;
  findByActiveDomain(hostname: string): Promise<CachedTenant | null>;
}

export type ResolvedHost =
  | { outcome: 'tenant'; tenant: CachedTenant }
  | { outcome: 'closed'; tenant: CachedTenant } // the shop exists but its public side is offline
  | { outcome: 'not_found' };

// LIF-stage table (docs/SRS.md): the public side is offline in these states. The shop's id is kept
// so the caller can log it, but no shop data is returned to the visitor.
export const CLOSED_STATES: ReadonlySet<TenantState> = new Set<TenantState>([
  'read_only',
  'locked',
  'archived',
  'deleted',
]);

/** TEN-7a: derives the tenant from the host alone. Nothing the client sends can choose a tenant. */
@Injectable()
export class TenantResolver {
  constructor(
    @Inject(TENANT_DIRECTORY) private readonly directory: TenantDirectory,
    @Inject(TenantCache) private readonly cache: TenantCache,
    @Inject(HostClassifier) private readonly hosts: HostClassifier,
  ) {}

  async resolve(rawHost: string | undefined): Promise<ResolvedHost> {
    const target = this.hosts.classify(rawHost);
    if (target.kind === 'invalid' || target.kind === 'platform') return { outcome: 'not_found' };

    const host = this.hosts.normalize(rawHost);
    if (host === null) return { outcome: 'not_found' };

    let tenant: CachedTenant | null | undefined = this.cache.get(host);
    if (!tenant) {
      tenant =
        target.kind === 'shop'
          ? await this.directory.findBySlug(target.slug)
          : await this.directory.findByActiveDomain(target.hostname);
      // Misses are not cached, so a shop that appears later is found on the next request.
      if (!tenant) return { outcome: 'not_found' };
      this.cache.set(host, tenant);
    }

    return CLOSED_STATES.has(tenant.state)
      ? { outcome: 'closed', tenant }
      : { outcome: 'tenant', tenant };
  }
}
