import { createFileRoute } from '@tanstack/react-router';
import { BrandSoonView } from '@/views/settings/brand-soon';

// Settings' Brand identity: a short page until its editor (Slice 11.12), its back arrow to Settings.
export const Route = createFileRoute('/$shop/settings_/brand')({
  staticData: {
    screen: { hub: 'menu', section: 'settings', title: 'sBrand', back: '/$shop/settings' },
  },
  component: BrandSoonView,
});
