import { createFileRoute } from '@tanstack/react-router';
import { Billing } from '@/views/billing';

export const Route = createFileRoute('/dashboard/billing')({
  component: Billing,
});
