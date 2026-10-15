import { useMutation } from '@tanstack/react-query';
import type { SuspendTenantInput } from '@lytronix/validators';
import { operatorSession } from '@/session/operator-session';

/** LIF-24: no tenant list/search endpoint exists anywhere yet (checked every operator controller) — the
    operator pastes a tenant id they already have, same precedent as the billing-term editor's tenantId
    field. No query to invalidate on success: there's nothing cached about this tenant in this console. */
export function useSuspendTenant() {
  return useMutation({
    mutationFn: ({ tenantId, ...input }: SuspendTenantInput & { tenantId: string }) =>
      operatorSession.client.post<{ ok: true }>(`/operator/tenants/${tenantId}/suspend`, input),
  });
}

export function useRestoreTenant() {
  return useMutation({
    mutationFn: (tenantId: string) =>
      operatorSession.client.post<{ ok: true }>(`/operator/tenants/${tenantId}/restore`),
  });
}
