import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PlanPaymentKind, RejectPaymentInput } from '@lytronix/validators';
import { operatorSession } from '@/session/operator-session';
import type { PlanPayment, QueuedPayment } from '@/types/operator';

export const PAYMENT_QUEUE_QUERY_KEY = ['operator', 'payment-queue'] as const;

export function fetchPaymentQueue(kind: PlanPaymentKind | null): Promise<QueuedPayment[]> {
  return operatorSession.client.get<QueuedPayment[]>(
    `/operator/payment-queue${kind ? `?kind=${kind}` : ''}`,
  );
}

/** ADM-06: every payment awaiting review. */
export function usePaymentQueue() {
  return useQuery({
    queryKey: [...PAYMENT_QUEUE_QUERY_KEY, 'all'],
    queryFn: () => fetchPaymentQueue(null),
  });
}

interface AmountInput {
  id: string;
  /** BIL-06: what the operator says arrived, when it isn't what a receipt says or what was quoted. */
  amount?: number;
}

function bodyOf(amount: number | undefined): { amount: number } | undefined {
  return amount === undefined ? undefined : { amount };
}

/** Approval activates the plan or credits the balance in the same call. */
export function useApprovePayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, amount }: AmountInput) =>
      operatorSession.client.post<PlanPayment>(
        `/operator/payment-queue/${id}/approve`,
        bodyOf(amount),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PAYMENT_QUEUE_QUERY_KEY });
    },
  });
}

/** BIL-06: the money goes on the seller's balance, and nothing is activated. */
export function useCreditPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, amount }: AmountInput) =>
      operatorSession.client.post<PlanPayment>(
        `/operator/payment-queue/${id}/credit`,
        bodyOf(amount),
      ),
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
