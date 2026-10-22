import { createFileRoute } from '@tanstack/react-router';
import { Invoices } from '@/views/invoices';

// The first build's screen, framed by the new shell until its own pull request of Slice 11 rebuilds it.
export const Route = createFileRoute('/$shop/invoices')({
  staticData: { screen: { hub: 'money', section: 'invoices', title: 'secInvoices', legacy: true } },
  component: Invoices,
});
