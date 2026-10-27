import { createFileRoute } from '@tanstack/react-router';
import { ApiKeysView } from '@/views/settings/api-keys';

// Settings' API keys (§7.26): reached by whoever may manage keys, its back arrow to Settings.
export const Route = createFileRoute('/$shop/settings_/api-keys')({
  staticData: {
    screen: { hub: 'menu', section: 'settings', title: 'sApi', back: '/$shop/settings' },
  },
  component: ApiKeysView,
});
