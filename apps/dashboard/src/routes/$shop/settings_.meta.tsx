import { createFileRoute } from '@tanstack/react-router';
import { MetaView } from '@/views/settings/meta';

// Settings' Facebook and Meta (§7.27): the pixel, the Conversions API token and the catalog feed, its back arrow to
// Settings.
export const Route = createFileRoute('/$shop/settings_/meta')({
  staticData: {
    screen: { hub: 'menu', section: 'settings', title: 'adTitle', back: '/$shop/settings' },
  },
  component: MetaView,
});
