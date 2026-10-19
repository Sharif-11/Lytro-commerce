import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateRoleInput,
  CreateStaffInput,
  UpdateRoleInput,
  UpdateStaffInput,
} from '@lytronix/validators';
import { tenantSession } from '@/session/tenant-session';
import type { RoleSummary, StaffList, StaffMember } from '@/types/staff';

export const STAFF_QUERY_KEY = ['staff'] as const;
export const ROLES_QUERY_KEY = ['roles'] as const;

// --- Staff (STF-01..07, STF-13) ---

export function useStaffList() {
  return useQuery({
    queryKey: STAFF_QUERY_KEY,
    queryFn: () => tenantSession.client.get<StaffList>('/staff'),
  });
}

export function useCreateStaff() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateStaffInput) =>
      tenantSession.client.post<StaffMember>('/staff', input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: STAFF_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: ROLES_QUERY_KEY });
    },
  });
}

export function useUpdateStaff() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateStaffInput & { id: string }) =>
      tenantSession.client.patch<StaffMember>(`/staff/${id}`, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: STAFF_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: ROLES_QUERY_KEY });
    },
  });
}

/** STF-13: the owner sets a new password; the member's sessions end and they choose their own next time. */
export function useResetStaffPassword() {
  return useMutation({
    mutationFn: ({ id, newPassword }: { id: string; newPassword: string }) =>
      tenantSession.client.post<{ ok: true }>(`/staff/${id}/password`, { newPassword }),
  });
}

// --- Roles (STF-07..09) ---

export function useRoles() {
  return useQuery({
    queryKey: ROLES_QUERY_KEY,
    queryFn: () => tenantSession.client.get<RoleSummary[]>('/roles'),
  });
}

export function useCreateRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateRoleInput) => tenantSession.client.post<RoleSummary>('/roles', input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ROLES_QUERY_KEY });
    },
  });
}

export function useUpdateRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateRoleInput & { id: string }) =>
      tenantSession.client.patch<RoleSummary>(`/roles/${id}`, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ROLES_QUERY_KEY });
    },
  });
}

/** 409 `conflict` with `holders` in the details when someone still holds the role (STF-09); the caller
    reads that off the error itself. */
export function useDeleteRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      tenantSession.client.request<{ ok: true }>(`/roles/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ROLES_QUERY_KEY });
    },
  });
}
