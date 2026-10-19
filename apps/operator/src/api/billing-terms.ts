import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateBillingTermInput, UpdateBillingTermInput } from '@lytronix/validators';
import { operatorSession } from '@/session/operator-session';
import type { BillingTerm } from '@/types/operator';

export const BILLING_TERMS_QUERY_KEY = ['operator', 'billing-terms'] as const;

/** Every term, hidden and retired ones included (TRM-01). */
export function useBillingTerms() {
  return useQuery({
    queryKey: BILLING_TERMS_QUERY_KEY,
    queryFn: () => operatorSession.client.get<BillingTerm[]>('/operator/billing-terms'),
  });
}

export function useCreateBillingTerm() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateBillingTermInput) =>
      operatorSession.client.post<BillingTerm>('/operator/billing-terms', input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: BILLING_TERMS_QUERY_KEY });
    },
  });
}

/** TRM-11: affects future purchases only. */
export function useUpdateBillingTerm() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateBillingTermInput & { id: string }) =>
      operatorSession.client.patch<BillingTerm>(`/operator/billing-terms/${id}`, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: BILLING_TERMS_QUERY_KEY });
    },
  });
}

/** TRM-12: a referenced term is retired, not deleted; it stops being offered and stays on invoices. */
export function useRetireBillingTerm() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      operatorSession.client.post<BillingTerm>(`/operator/billing-terms/${id}/retire`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: BILLING_TERMS_QUERY_KEY });
    },
  });
}

/** Only an unreferenced term can go; the server answers 409 otherwise. */
export function useDeleteBillingTerm() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      operatorSession.client.delete<{ ok: true }>(`/operator/billing-terms/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: BILLING_TERMS_QUERY_KEY });
    },
  });
}
