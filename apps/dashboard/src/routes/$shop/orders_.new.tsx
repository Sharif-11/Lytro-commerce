import { createFileRoute } from '@tanstack/react-router';
import { Permission } from '@lytronix/validators';
import { NewOrderView } from '@/views/orders/order-editor';

// TENANT-DASHBOARD-DESIGN §7.31: New order, from the list's New order, an empty list and the + menu; entering orders
// needs orders:manage.
export const Route = createFileRoute('/$shop/orders_/new')({
  staticData: {
    screen: {
      hub: 'orders',
      title: 'pOrder',
      back: '/$shop/orders',
      needs: [Permission.OrdersManage],
    },
  },
  component: NewOrderView,
});
