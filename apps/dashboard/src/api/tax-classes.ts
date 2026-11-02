import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { tenantSession } from '@/session/tenant-session';
import type { TaxClasses } from '@/types/tax';

// Tax classes (TENANT-DASHBOARD-DESIGN §7.33, Slice 4.8c; TAX-01). Reading needs products:read or settings:manage,
// changing settings:manage. Every write answers with the classes as they now are.

const TAX_QUERY_KEY = ['tax-classes'] as const;

/** GET /tax-classes: the classes and the default. */
export function useTaxClasses(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: TAX_QUERY_KEY,
    queryFn: () => tenantSession.client.get<TaxClasses>('/tax-classes'),
    enabled: options.enabled ?? true,
  });
}

/** After a write: its answer is the classes now. */
function useChanged(): (classes: TaxClasses) => void {
  const queryClient = useQueryClient();
  return (classes) => {
    queryClient.setQueryData(TAX_QUERY_KEY, classes);
  };
}

/** POST /tax-classes: a new class. */
export function useCreateTaxClass() {
  const changed = useChanged();
  return useMutation({
    mutationFn: (body: { name: string; rate: number }) =>
      tenantSession.client.post<TaxClasses>('/tax-classes', body),
    onSuccess: changed,
  });
}

/** PATCH /tax-classes/:id: a class's name or rate; new orders take the new rate, past ones keep theirs (TAX-02). */
export function useUpdateTaxClass(id: string) {
  const changed = useChanged();
  return useMutation({
    mutationFn: (body: { name?: string; rate?: number }) =>
      tenantSession.client.patch<TaxClasses>(`/tax-classes/${id}`, body),
    onSuccess: changed,
  });
}

/** DELETE /tax-classes/:id: refused while products use it. */
export function useDeleteTaxClass(id: string) {
  const changed = useChanged();
  return useMutation({
    mutationFn: () => tenantSession.client.delete<TaxClasses>(`/tax-classes/${id}`),
    onSuccess: changed,
  });
}

/** PUT /tax-classes/default: what new products start with; null for no tax. */
export function useSetDefaultTaxClass() {
  const changed = useChanged();
  return useMutation({
    mutationFn: (taxClassId: string | null) =>
      tenantSession.client.put<TaxClasses>('/tax-classes/default', { taxClassId }),
    onSuccess: changed,
  });
}
