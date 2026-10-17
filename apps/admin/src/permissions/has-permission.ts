import type { Permission } from '@lytronix/validators';
import type { MeResponse } from '@/types/me';

/** The one place "does this viewer hold permission X" is decided -- the owner implicitly holds every
    permission (D32); a staff member needs it in their own `permissions` list. Defaults to false while
    `/me` hasn't resolved yet (`me` undefined), the same safer-default `visibleNavItems` already settled on. */
export function hasPermission(
  me: Pick<MeResponse, 'isOwner' | 'permissions'> | undefined,
  permission: Permission,
): boolean {
  if (me?.isOwner) return true;
  return (me?.permissions ?? []).includes(permission);
}
