import type { TenantState } from '@lytronix/validators';

/**
 * Mirrors `MeResponse` in apps/server/src/modules/identity/controllers/me.controller.ts. No shared package
 * exports response shapes yet (only request validation and error codes), so this is a deliberate structural
 * duplicate of a server-only type.
 */
export interface MeTenant {
  id: string;
  slug: string;
  shopName: string;
  state: TenantState;
  suspended: boolean;
  planName: string | null;
  periodEnd: string | null;
}

export interface MeResponse {
  subscriber: { id: string };
  /** The owner implicitly holds every permission (D32). */
  isOwner: boolean;
  /** Only meaningful when `isOwner` is false. */
  permissions: string[];
  tenant: MeTenant | null;
}
