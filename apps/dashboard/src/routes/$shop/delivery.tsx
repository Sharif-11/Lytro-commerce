import { createFileRoute } from '@tanstack/react-router';
import { DeliveryView } from '@/views/delivery';

// TENANT-DASHBOARD-DESIGN §7.10: the Shop hub's Delivery.
export const Route = createFileRoute('/$shop/delivery')({
  staticData: { screen: { hub: 'shop', section: 'delivery', title: 'secDelivery' } },
  component: DeliveryView,
});
