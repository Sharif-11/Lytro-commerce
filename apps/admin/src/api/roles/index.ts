import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateRoleInput, UpdateRoleInput } from '@lytronix/validators';
import { tenantSession } from '@/session/tenant-session';
import type { RoleSummary } from '@/types/role';

export const ROLES_QUERY_KEY = ['roles'] as const;

export function useRoles() {
  return useQuery({
    queryKey: ROLES_QUERY_KEY,
    queryFn: () => tenantSession.client.get<RoleSummary[]>('/roles'),
  });
}

export function useCreateRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateRoleInput) => tenantSession.client.post('/roles', input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ROLES_QUERY_KEY });
    },
  });
}

export function useUpdateRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateRoleInput & { id: string }) =>
      tenantSession.client.patch(`/roles/${id}`, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ROLES_QUERY_KEY });
    },
  });
}

/** DELETE /roles/:id answers 409 conflict with { holders } in the error details when the role is still held
    by someone (RoleService.remove) — the caller reads that off the thrown ApiClientError directly rather
    than through the generic errorMessage() mapping, since "conflict" alone doesn't say how many people. */
export function useDeleteRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => tenantSession.client.delete<{ ok: true }>(`/roles/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ROLES_QUERY_KEY });
    },
  });
}
