import { createFileRoute } from '@tanstack/react-router';
import { Invoices } from '@/views/invoices';

export const Route = createFileRoute('/dashboard/invoices')({
  component: Invoices,
});
