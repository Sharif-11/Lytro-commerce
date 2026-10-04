import type { CachedTenant } from './cached-tenant';

export type ResolvedHost =
  | { outcome: 'tenant'; tenant: CachedTenant }
  | { outcome: 'closed'; tenant: CachedTenant } // the shop exists but its public side is offline
  | { outcome: 'not_found' };
