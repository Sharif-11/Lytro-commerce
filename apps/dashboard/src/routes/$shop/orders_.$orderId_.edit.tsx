import { createFileRoute } from '@tanstack/react-router';
import { Permission } from '@lytronix/validators';
import { EditOrderView } from '@/views/orders/order-editor';

// TENANT-DASHBOARD-DESIGN §7.31: Edit order, from the order's more menu until it ships (ORD-11).
export const Route = createFileRoute('/$shop/orders_/$orderId_/edit')({
  staticData: {
    screen: {
      hub: 'orders',
      title: 'editOrder',
      back: '/$shop/orders',
      needs: [Permission.OrdersManage],
    },
  },
  component: EditOrderRoute,
});

function EditOrderRoute(): React.JSX.Element {
  const { orderId } = Route.useParams();
  return <EditOrderView key={orderId} orderId={orderId} />;
}
