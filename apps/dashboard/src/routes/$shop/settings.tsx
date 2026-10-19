import { createFileRoute } from '@tanstack/react-router';
import { ShopSettingsView } from '@/views/settings';

export const Route = createFileRoute('/$shop/settings')({
  component: ShopSettingsView,
});
