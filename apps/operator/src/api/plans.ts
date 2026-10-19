import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AssignPlanInput,
  CreatePlanInput,
  SetPlanPriceInput,
  UpdatePlanInput,
} from '@lytronix/validators';
import { operatorSession } from '@/session/operator-session';
import type { Plan, PlanAssignment, PlanPrice, PlanVersion } from '@/types/operator';

export const PLANS_QUERY_KEY = ['operator', 'plans'] as const;
export const planVersionsKey = (planId: string) =>
  [...PLANS_QUERY_KEY, planId, 'versions'] as const;
export const planPricesKey = (planId: string) => [...PLANS_QUERY_KEY, planId, 'prices'] as const;

/** Every plan, including not-for-sale ones (PLN-01). */
export function usePlans() {
  return useQuery({
    queryKey: PLANS_QUERY_KEY,
    queryFn: () => operatorSession.client.get<Plan[]>('/operator/plans'),
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

/** TRM-03: a plan's price per billing term. */
export function usePlanPrices(planId: string | null) {
  return useQuery({
    queryKey: planPricesKey(planId ?? ''),
    queryFn: () =>
      operatorSession.client.get<PlanPrice[]>(`/operator/plans/${planId ?? ''}/prices`),
    enabled: planId !== null,
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
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: planPricesKey(variables.planId) });
    },
  });
}

export function useRemovePlanPrice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ planId, billingTermId }: { planId: string; billingTermId: string }) =>
      operatorSession.client.delete<{ ok: true }>(
        `/operator/plans/${planId}/prices/${billingTermId}`,
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: planPricesKey(variables.planId) });
    },
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
