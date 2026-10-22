import { createFileRoute } from '@tanstack/react-router';
import { OrdersSoon } from '@/views/orders-soon';

// TENANT-DASHBOARD-DESIGN §7.2: the Orders tab until Phase 4.
export const Route = createFileRoute('/$shop/orders')({
  staticData: { screen: { hub: 'orders', title: 'hubOrders' } },
  component: OrdersSoon,
});
