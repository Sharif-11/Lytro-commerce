import { createFileRoute } from '@tanstack/react-router';
import { PlanView } from '@/views/plan';

// TRL-08's "see plans", and the renewal screen for a locked or archived shop (LIF-11, LIF-15). The first build's,
// framed by the new shell until Slice 11.5 rebuilds it.
export const Route = createFileRoute('/$shop/plan')({
  staticData: { screen: { hub: 'money', section: 'plan', title: 'secPlan', legacy: true } },
  component: PlanView,
});
