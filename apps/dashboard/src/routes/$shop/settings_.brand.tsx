import { createFileRoute } from '@tanstack/react-router';
import { BrandView } from '@/views/brand';

// Settings' Brand identity (§7.28, Slice 11.12a): the editor with its live preview, its back arrow to Settings.
export const Route = createFileRoute('/$shop/settings_/brand')({
  staticData: {
    screen: { hub: 'menu', section: 'settings', title: 'sBrand', back: '/$shop/settings' },
  },
  component: BrandView,
});
