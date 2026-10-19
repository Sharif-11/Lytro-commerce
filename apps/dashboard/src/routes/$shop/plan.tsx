import { createFileRoute } from '@tanstack/react-router';
import { PlanView } from '@/views/plan';

// TRL-08's "see plans", and the renewal screen for a locked or archived shop (LIF-11, LIF-15).
export const Route = createFileRoute('/$shop/plan')({
  component: PlanView,
});
