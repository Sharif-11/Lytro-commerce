import { createFileRoute } from '@tanstack/react-router';
import { SettingsView } from '@/views/settings';

// TENANT-DASHBOARD-DESIGN §7.16: the Menu hub's Settings section, its rows into the shop's own settings.
export const Route = createFileRoute('/$shop/settings')({
  staticData: { screen: { hub: 'menu', section: 'settings', title: 'secSettings' } },
  component: SettingsView,
});
