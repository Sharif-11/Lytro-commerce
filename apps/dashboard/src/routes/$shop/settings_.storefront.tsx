import { createFileRoute } from '@tanstack/react-router';
import { StorefrontView } from '@/views/settings/storefront';

// Settings' Storefront (§7.29, Slice 12a): reached by whoever may manage settings, its back arrow to Settings.
export const Route = createFileRoute('/$shop/settings_/storefront')({
  staticData: {
    screen: { hub: 'menu', section: 'settings', title: 'sStore', back: '/$shop/settings' },
  },
  component: StorefrontView,
});
