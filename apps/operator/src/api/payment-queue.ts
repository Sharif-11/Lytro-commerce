import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PlanPaymentKind, RejectPaymentInput } from '@lytronix/validators';
import { operatorSession } from '@/session/operator-session';
import type { PlanPayment } from '@/types/operator';

export const PAYMENT_QUEUE_QUERY_KEY = ['operator', 'payment-queue'] as const;

/** ADM-06: every payment awaiting review, optionally one kind. */
export function usePaymentQueue(kind: PlanPaymentKind | null) {
  return useQuery({
    queryKey: [...PAYMENT_QUEUE_QUERY_KEY, kind ?? 'all'],
    queryFn: () =>
      operatorSession.client.get<PlanPayment[]>(
        `/operator/payment-queue${kind ? `?kind=${kind}` : ''}`,
      ),
  });
}

/** Approval activates the plan or credits the balance in the same call. */
export function useApprovePayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      operatorSession.client.post<PlanPayment>(`/operator/payment-queue/${id}/approve`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PAYMENT_QUEUE_QUERY_KEY });
    },
  });
}

export function useRejectPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: RejectPaymentInput & { id: string }) =>
      operatorSession.client.post<PlanPayment>(`/operator/payment-queue/${id}/reject`, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PAYMENT_QUEUE_QUERY_KEY });
    },
  });
}
