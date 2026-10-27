import { createFileRoute } from '@tanstack/react-router';
import { ShopDetailsView } from '@/views/settings/shop-details';

// Settings' Shop details: a sibling route, its back arrow to Settings.
export const Route = createFileRoute('/$shop/settings_/shop')({
  staticData: {
    screen: { hub: 'menu', section: 'settings', title: 'sShop', back: '/$shop/settings' },
  },
  component: ShopDetailsView,
});
