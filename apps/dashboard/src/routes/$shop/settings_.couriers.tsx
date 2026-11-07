import { createFileRoute } from '@tanstack/react-router';
import { CouriersView } from '@/views/couriers';

// Settings' Couriers (§7.39, Phase 6): the shop's own courier accounts, for whoever may book; connecting is couriers:manage.
export const Route = createFileRoute('/$shop/settings_/couriers')({
  staticData: {
    screen: { hub: 'menu', section: 'settings', title: 'sCourier', back: '/$shop/settings' },
  },
  component: CouriersView,
});
