import { createFileRoute } from '@tanstack/react-router';
import { PaymentsView, paymentsSearch } from '@/views/payments';

// TENANT-DASHBOARD-DESIGN §7.36: Money's Payments, the shop's incoming money. The tab, search and filters sit in the address, so
// Back from an order returns to the same list.
export const Route = createFileRoute('/$shop/payments')({
  validateSearch: paymentsSearch,
  staticData: { screen: { hub: 'money', section: 'payments', title: 'secPayments' } },
  component: PaymentsRoute,
});

function PaymentsRoute(): React.JSX.Element {
  return <PaymentsView search={Route.useSearch()} />;
}
