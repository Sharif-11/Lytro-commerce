import type { TenantState } from '@lytronix/validators';

/**
 * Mirrors `MeResponse` in apps/server/src/modules/identity/controllers/me.controller.ts. There is no shared
 * package exporting response shapes yet (only request validation via @lytronix/validators and error codes via
 * @lytronix/shared-types) — this is a deliberate structural duplicate of a server-only type, not a copy of
 * something this package could otherwise import.
 */
export interface MeResponse {
  subscriber: { id: string };
  /** The owner implicitly holds every permission — treat this as "show everything" rather than checking
      `permissions` at all (D32). */
  isOwner: boolean;
  /** Only meaningful when `isOwner` is false. Always `[]` for the owner. */
  permissions: string[];
  tenant: {
    id: string;
    slug: string;
    shopName: string;
    state: TenantState;
    planName: string | null;
    periodEnd: string | null;
  } | null;
}
