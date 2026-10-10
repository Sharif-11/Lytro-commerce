import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateStaffInput, UpdateStaffInput } from '@lytronix/validators';
import { tenantSession } from '@/session/tenant-session';
import type { StaffList, StaffMember } from '@/types/staff';

export const STAFF_QUERY_KEY = ['staff'] as const;

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
    },
  });
}

export function useResetStaffPassword() {
  return useMutation({
    mutationFn: ({ id, newPassword }: { id: string; newPassword: string }) =>
      tenantSession.client.post<{ ok: true }>(`/staff/${id}/password`, { newPassword }),
  });
}
