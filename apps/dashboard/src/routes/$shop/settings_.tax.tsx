import { createFileRoute } from '@tanstack/react-router';
import { TaxView } from '@/views/settings/tax';

// Settings' Tax (§7.33): the shop's tax classes and its default, for whoever may manage settings.
export const Route = createFileRoute('/$shop/settings_/tax')({
  staticData: {
    screen: { hub: 'menu', section: 'settings', title: 'sTax', back: '/$shop/settings' },
  },
  component: TaxView,
});
