import type { TenantLookupRow } from '@lytronix/db';

/** A shop as the resolver needs it. Same shape as the database lookup row, so it is not defined twice. */
export type CachedTenant = TenantLookupRow;
