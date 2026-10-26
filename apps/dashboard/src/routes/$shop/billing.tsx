import { createFileRoute } from '@tanstack/react-router';
import { BillingView } from '@/views/billing';

// TENANT-DASHBOARD-DESIGN §7.13, BIL-19: the shop's payments to Lytro, in place of the first build's Invoices.
export const Route = createFileRoute('/$shop/billing')({
  staticData: { screen: { hub: 'money', section: 'billing', title: 'secBilling' } },
  component: BillingRoute,
});

function BillingRoute(): React.JSX.Element {
  return <BillingView paymentId={null} />;
}
