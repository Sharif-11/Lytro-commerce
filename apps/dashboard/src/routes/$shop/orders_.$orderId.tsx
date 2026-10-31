import { createFileRoute } from '@tanstack/react-router';
import { OrdersScreen } from '@/views/orders';
import { filterOf, ordersSearch } from '@/views/orders/order-search';

// TENANT-DASHBOARD-DESIGN §7.31: one order, on its own on a phone and beside the list from 1024 px.
export const Route = createFileRoute('/$shop/orders_/$orderId')({
  validateSearch: ordersSearch,
  staticData: { screen: { hub: 'orders', title: 'hubOrders', back: '/$shop/orders' } },
  component: OrderRoute,
});

function OrderRoute(): React.JSX.Element {
  const { orderId } = Route.useParams();
  return <OrdersScreen filter={filterOf(Route.useSearch())} orderId={orderId} />;
}
