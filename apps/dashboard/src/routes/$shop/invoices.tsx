import { createFileRoute } from '@tanstack/react-router';
import { Invoices } from '@/views/invoices';

export const Route = createFileRoute('/$shop/invoices')({
  component: Invoices,
});
