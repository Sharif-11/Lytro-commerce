import { createFileRoute } from '@tanstack/react-router';
import { ExportsView } from '@/views/settings/exports';

// Settings' Data export: the owner's alone, its back arrow to Settings.
export const Route = createFileRoute('/$shop/settings_/export')({
  staticData: {
    screen: { hub: 'menu', section: 'settings', title: 'sExport', back: '/$shop/settings' },
  },
  component: ExportsView,
});
