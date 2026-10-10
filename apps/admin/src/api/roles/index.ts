import { useQuery } from '@tanstack/react-query';
import { tenantSession } from '@/session/tenant-session';
import type { RoleSummary } from '@/types/role';

export const ROLES_QUERY_KEY = ['roles'] as const;

/** Read-only for now — just enough to populate the staff form's role picker. Full role CRUD (create/edit/
    delete, permission assignment) is its own later screen, not part of the staff slice. */
export function useRoles() {
  return useQuery({
    queryKey: ROLES_QUERY_KEY,
    queryFn: () => tenantSession.client.get<RoleSummary[]>('/roles'),
  });
}
