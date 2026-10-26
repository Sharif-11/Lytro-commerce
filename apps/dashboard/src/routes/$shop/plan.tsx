import { createFileRoute } from '@tanstack/react-router';
import { PlanView } from '@/views/plan';

// TENANT-DASHBOARD-DESIGN §7.12: Plan, TRL-08's "see plans"; a locked or archived shop is sent to Renew instead.
export const Route = createFileRoute('/$shop/plan')({
  staticData: { screen: { hub: 'money', section: 'plan', title: 'secPlan' } },
  component: PlanView,
});
