import { createFileRoute } from '@tanstack/react-router';
import { DesignView } from '@/views/design/design-page';

// Settings > Storefront > Design (STOREFRONT-BUILDER-PLAN SB-7 to SB-13): the theme, the logo and icon and the home
// page's sections beside a live preview of the draft; reached by whoever may manage settings, its back arrow to
// Storefront.
export const Route = createFileRoute('/$shop/settings_/storefront_/design')({
  staticData: {
    screen: {
      hub: 'menu',
      section: 'settings',
      title: 'sDesign',
      back: '/$shop/settings/storefront',
    },
  },
  component: DesignView,
});
