import { Inject, Injectable } from '@nestjs/common';
import { TenantState } from '@lytronix/validators';
import { HostClassifier } from './host-classifier';
import { TenantCache } from './tenant-cache';
import { type CachedTenant } from '../types/cached-tenant';
import { TENANT_DIRECTORY } from '../tokens';
import type { TenantDirectory } from '../ports/tenant-directory';
import type { ResolvedHost } from '../types/resolved-host';

// LIF-stage table (docs/SRS.md): the public side is offline in these states. The shop's id is kept
// so the caller can log it, but no shop data is returned to the visitor.
export const CLOSED_STATES: ReadonlySet<TenantState> = new Set<TenantState>([
  TenantState.ReadOnly,
  TenantState.Locked,
  TenantState.Archived,
  TenantState.Deleted,
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
