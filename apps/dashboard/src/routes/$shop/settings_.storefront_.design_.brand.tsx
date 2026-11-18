import { createFileRoute } from '@tanstack/react-router';
import { LogoIconView } from '@/views/design/logo-icon-page';

// The design's logo and icon (STOREFRONT-BUILDER-PLAN SB-5, every plan), its back arrow to the design page.
export const Route = createFileRoute('/$shop/settings_/storefront_/design_/brand')({
  staticData: {
    screen: {
      hub: 'menu',
      section: 'settings',
      title: 'sLogoIcon',
      back: '/$shop/settings/storefront/design',
    },
  },
  component: LogoIconView,
});
