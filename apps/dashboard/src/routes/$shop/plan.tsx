import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { PlanView } from '@/views/plan';

// TENANT-DASHBOARD-DESIGN §7.12: Plan, TRL-08's "see plans"; a locked or archived shop is sent to Renew instead.
// ?plan=<id> opens that plan's sheet -- its upgrade, or how to take it -- for Usage's "To raise it" (Slice 11.5c).
export const Route = createFileRoute('/$shop/plan')({
  validateSearch: z.object({ plan: z.string().optional().catch(undefined) }),
  staticData: { screen: { hub: 'money', section: 'plan', title: 'secPlan' } },
  component: PlanRoute,
});

function PlanRoute(): React.JSX.Element {
  const { plan } = Route.useSearch();
  return <PlanView openPlanId={plan ?? null} />;
}
