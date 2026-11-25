import { createFileRoute } from '@tanstack/react-router';
import { DevelopersView } from '@/views/settings/developers';

// Developer API (TENANT-DASHBOARD-DESIGN §7.48): the API docs beside API keys, opened from its Developer docs card; back
// returns to API keys.
export const Route = createFileRoute('/$shop/settings_/developers')({
  staticData: {
    screen: {
      hub: 'menu',
      section: 'settings',
      title: 'dvTitle',
      back: '/$shop/settings/api-keys',
    },
  },
  component: DevelopersView,
});
