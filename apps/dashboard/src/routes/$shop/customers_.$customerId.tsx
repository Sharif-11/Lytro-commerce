import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { CustomersScreen } from '@/views/customers';

// TENANT-DASHBOARD-DESIGN §7.32: one customer, on their own on a phone and beside the list from 1024 px.
export const Route = createFileRoute('/$shop/customers_/$customerId')({
  validateSearch: z.object({ q: z.string().optional().catch(undefined) }),
  staticData: {
    screen: {
      hub: 'orders',
      section: 'customers',
      title: 'secCustomers',
      back: '/$shop/customers',
    },
  },
  component: CustomerRoute,
});

function CustomerRoute(): React.JSX.Element {
  const { customerId } = Route.useParams();
  return <CustomersScreen q={Route.useSearch().q ?? ''} customerId={customerId} />;
}
