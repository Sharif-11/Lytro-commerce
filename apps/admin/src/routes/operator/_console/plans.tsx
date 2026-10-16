import { createFileRoute } from '@tanstack/react-router';
import { OperatorPlans } from '@/views/operator/plans';

export const Route = createFileRoute('/operator/_console/plans')({
  component: OperatorPlans,
});
