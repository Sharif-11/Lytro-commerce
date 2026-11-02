import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { CustomersScreen } from '@/views/customers';

// TENANT-DASHBOARD-DESIGN §7.32: the Orders hub's customers. The search sits in the address, so Back from a customer
// returns to the same list.
export const Route = createFileRoute('/$shop/customers')({
  validateSearch: z.object({ q: z.string().optional().catch(undefined) }),
  staticData: { screen: { hub: 'orders', section: 'customers', title: 'secCustomers' } },
  component: CustomersRoute,
});

function CustomersRoute(): React.JSX.Element {
  return <CustomersScreen q={Route.useSearch().q ?? ''} customerId={null} />;
}
