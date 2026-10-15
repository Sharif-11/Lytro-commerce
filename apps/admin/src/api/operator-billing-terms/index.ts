import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateBillingTermInput, UpdateBillingTermInput } from '@lytronix/validators';
import { operatorSession } from '@/session/operator-session';
import type { BillingTerm } from '@/types/billing-admin';

export const OPERATOR_BILLING_TERMS_QUERY_KEY = ['operator', 'billing-terms'] as const;

/** Lists every term including hidden/retired ones (TRM-01) — the operator editor, unlike the public plan
    comparison, needs to see and manage those too. */
export function useOperatorBillingTerms() {
  return useQuery({
    queryKey: OPERATOR_BILLING_TERMS_QUERY_KEY,
    queryFn: () => operatorSession.client.get<BillingTerm[]>('/operator/billing-terms'),
  });
}

export function useCreateBillingTerm() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateBillingTermInput) =>
      operatorSession.client.post<BillingTerm>('/operator/billing-terms', input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: OPERATOR_BILLING_TERMS_QUERY_KEY });
    },
  });
}

export function useUpdateBillingTerm() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateBillingTermInput & { id: string }) =>
      operatorSession.client.patch<BillingTerm>(`/operator/billing-terms/${id}`, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: OPERATOR_BILLING_TERMS_QUERY_KEY });
    },
  });
}

export function useDeleteBillingTerm() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      operatorSession.client.delete<{ ok: true }>(`/operator/billing-terms/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: OPERATOR_BILLING_TERMS_QUERY_KEY });
    },
  });
}
