import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type {
  AssignPlanInput,
  CreatePlanInput,
  SetPlanPriceInput,
  UpdatePlanInput,
} from '@lytronix/validators';
import { BILLING_TERMS_QUERY_KEY } from '@/api/billing-terms';
import { operatorSession } from '@/session/operator-session';
import type { OperatorPlan, Plan, PlanAssignment, PlanPrice, PlanVersion } from '@/types/operator';

export const PLANS_QUERY_KEY = ['operator', 'plans'] as const;
export const planVersionsKey = (planId: string) =>
  [...PLANS_QUERY_KEY, planId, 'versions'] as const;
export const PRICES_QUERY_KEY = ['operator', 'plan-prices'] as const;

/** Every plan, including not-for-sale ones (PLN-01). */
export function usePlans() {
  return useQuery({
    queryKey: PLANS_QUERY_KEY,
    queryFn: () => operatorSession.client.get<OperatorPlan[]>('/operator/plans'),
  });
}

/** PLN-02: a plan's prior versions, read-only. */
export function usePlanVersions(planId: string | null) {
  return useQuery({
    queryKey: planVersionsKey(planId ?? ''),
    queryFn: () =>
      operatorSession.client.get<PlanVersion[]>(`/operator/plans/${planId ?? ''}/versions`),
    enabled: planId !== null,
  });
}

/** TRM-03: every plan's price per billing term: the matrix, and the terms' priced counts. */
export function usePlanPrices() {
  return useQuery({
    queryKey: PRICES_QUERY_KEY,
    queryFn: () => operatorSession.client.get<PlanPrice[]>('/operator/billing-terms/prices'),
  });
}

export function useCreatePlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePlanInput) =>
      operatorSession.client.post<Plan>('/operator/plans', input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PLANS_QUERY_KEY });
    },
  });
}

export function useUpdatePlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdatePlanInput & { id: string }) =>
      operatorSession.client.patch<Plan>(`/operator/plans/${id}`, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PLANS_QUERY_KEY });
    },
  });
}

/** Refused with 409 while any tenant or invoice still references the plan. */
export function useDeletePlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      operatorSession.client.delete<{ ok: true }>(`/operator/plans/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PLANS_QUERY_KEY });
    },
  });
}

/** A price decides what a term's and a plan's Delete may do, as well as the matrix. */
function afterPriceChange(queryClient: QueryClient): Promise<unknown> {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: PRICES_QUERY_KEY }),
    queryClient.invalidateQueries({ queryKey: PLANS_QUERY_KEY }),
    queryClient.invalidateQueries({ queryKey: BILLING_TERMS_QUERY_KEY }),
  ]);
}

export function useSetPlanPrice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      planId,
      billingTermId,
      ...input
    }: SetPlanPriceInput & { planId: string; billingTermId: string }) =>
      operatorSession.client.put<{ ok: true }>(
        `/operator/plans/${planId}/prices/${billingTermId}`,
        input,
      ),
    // Waits for the new prices, so a cell doesn't show the old one between saving and the read.
    onSuccess: () => afterPriceChange(queryClient),
  });
}

export function useRemovePlanPrice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ planId, billingTermId }: { planId: string; billingTermId: string }) =>
      operatorSession.client.delete<{ ok: true }>(
        `/operator/plans/${planId}/prices/${billingTermId}`,
      ),
    onSuccess: () => afterPriceChange(queryClient),
  });
}

/** PLN-17/18: puts a tenant on a plan without payment, with a reason and an optional expiry. */
export function useAssignPlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ planId, ...input }: AssignPlanInput & { planId: string }) =>
      operatorSession.client.post<PlanAssignment>(`/operator/plans/${planId}/assign`, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['operator', 'tenants'] });
    },
  });
}
