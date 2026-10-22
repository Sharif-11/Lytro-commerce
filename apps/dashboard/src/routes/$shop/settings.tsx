import { createFileRoute } from '@tanstack/react-router';
import { ShopSettingsView } from '@/views/settings';

// The first build's screen, framed by the new shell until its own pull request of Slice 11 rebuilds it.
export const Route = createFileRoute('/$shop/settings')({
  staticData: { screen: { hub: 'menu', section: 'settings', title: 'secSettings', legacy: true } },
  component: ShopSettingsView,
});
