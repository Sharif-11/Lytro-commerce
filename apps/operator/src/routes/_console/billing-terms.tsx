import { createFileRoute } from '@tanstack/react-router';
import { BillingTerms } from '@/views/billing-terms';

export const Route = createFileRoute('/_console/billing-terms')({
  component: BillingTerms,
});
