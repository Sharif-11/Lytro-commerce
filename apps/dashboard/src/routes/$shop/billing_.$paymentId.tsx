import { createFileRoute } from '@tanstack/react-router';
import { BillingView } from '@/views/billing';

// TENANT-DASHBOARD-DESIGN §7.13: one payment, on a phone its own screen with Back; from 1024 px beside the list.
export const Route = createFileRoute('/$shop/billing_/$paymentId')({
  staticData: {
    screen: { hub: 'money', section: 'billing', title: 'secBilling', back: '/$shop/billing' },
  },
  component: PaymentRoute,
});

function PaymentRoute(): React.JSX.Element {
  const { paymentId } = Route.useParams();
  return <BillingView paymentId={paymentId} />;
}
