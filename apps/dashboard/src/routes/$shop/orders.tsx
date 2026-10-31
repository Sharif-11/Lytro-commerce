import { createFileRoute } from '@tanstack/react-router';
import { OrdersScreen } from '@/views/orders';
import { filterOf, ordersSearch } from '@/views/orders/order-search';

// TENANT-DASHBOARD-DESIGN §7.31: the Orders hub's list. The tab, search and dates sit in the address, so Back from an
// order returns to the same list.
export const Route = createFileRoute('/$shop/orders')({
  validateSearch: ordersSearch,
  staticData: { screen: { hub: 'orders', title: 'hubOrders' } },
  component: OrdersRoute,
});

function OrdersRoute(): React.JSX.Element {
  return <OrdersScreen filter={filterOf(Route.useSearch())} orderId={null} />;
}
