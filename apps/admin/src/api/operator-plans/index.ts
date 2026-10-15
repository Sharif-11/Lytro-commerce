import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreatePlanInput, SetPlanPriceInput, UpdatePlanInput } from '@lytronix/validators';
import { operatorSession } from '@/session/operator-session';
import type { Plan, PlanPrice, PlanVersion } from '@/types/billing-admin';

export const OPERATOR_PLANS_QUERY_KEY = ['operator', 'plans'] as const;
export const operatorPlanVersionsKey = (planId: string) =>
  ['operator', 'plans', planId, 'versions'] as const;
export const operatorPlanPricesKey = (planId: string) =>
  ['operator', 'plans', planId, 'prices'] as const;

export function useOperatorPlans() {
  return useQuery({
    queryKey: OPERATOR_PLANS_QUERY_KEY,
    queryFn: () => operatorSession.client.get<Plan[]>('/operator/plans'),
  });
}

/** PLN-02: a plan's version history, read-only here — shown inline once a plan is open for edit. */
export function useOperatorPlanVersions(planId: string | null) {
  return useQuery({
    queryKey: operatorPlanVersionsKey(planId ?? ''),
    queryFn: () =>
      operatorSession.client.get<PlanVersion[]>(`/operator/plans/${planId ?? ''}/versions`),
    enabled: planId !== null,
  });
}

/** TRM-03: a plan's price per billing term — nested under the plan, same as the server's own routing. */
export function useOperatorPlanPrices(planId: string | null) {
  return useQuery({
    queryKey: operatorPlanPricesKey(planId ?? ''),
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
      void queryClient.invalidateQueries({ queryKey: OPERATOR_PLANS_QUERY_KEY });
    },
  });
}

export function useUpdatePlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdatePlanInput & { id: string }) =>
      operatorSession.client.patch<Plan>(`/operator/plans/${id}`, input),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: OPERATOR_PLANS_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: operatorPlanVersionsKey(variables.id) });
    },
  });
}

/** Refused (409) by the server when the plan is still referenced (PlansRepository.isReferenced) — the
    caller surfaces that through the generic errorMessage() mapping, same as useDeleteRole. */
export function useDeletePlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      operatorSession.client.delete<{ ok: true }>(`/operator/plans/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: OPERATOR_PLANS_QUERY_KEY });
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
      void queryClient.invalidateQueries({ queryKey: operatorPlanPricesKey(variables.planId) });
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
      void queryClient.invalidateQueries({ queryKey: operatorPlanPricesKey(variables.planId) });
    },
  });
}
