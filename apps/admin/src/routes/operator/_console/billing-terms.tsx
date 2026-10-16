import { createFileRoute } from '@tanstack/react-router';
import { OperatorBillingTerms } from '@/views/operator/billing-terms';

export const Route = createFileRoute('/operator/_console/billing-terms')({
  component: OperatorBillingTerms,
});
