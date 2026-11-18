import { createFileRoute } from '@tanstack/react-router';
import { ThemesView } from '@/views/design/themes-page';

// The design's theme gallery (STOREFRONT-BUILDER-PLAN SB-7), its back arrow to the design page.
export const Route = createFileRoute('/$shop/settings_/storefront_/design_/themes')({
  staticData: {
    screen: {
      hub: 'menu',
      section: 'settings',
      title: 'sThemes',
      back: '/$shop/settings/storefront/design',
    },
  },
  component: ThemesView,
});
