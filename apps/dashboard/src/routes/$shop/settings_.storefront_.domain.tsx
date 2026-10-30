import { createFileRoute } from '@tanstack/react-router';
import { DomainView } from '@/views/settings/domain';

// Settings > Storefront's own domain (§7.30, Slice 13): reached by whoever may manage settings, its back arrow to
// Storefront.
export const Route = createFileRoute('/$shop/settings_/storefront_/domain')({
  staticData: {
    screen: {
      hub: 'menu',
      section: 'settings',
      title: 'sDomain',
      back: '/$shop/settings/storefront',
    },
  },
  component: DomainView,
});
