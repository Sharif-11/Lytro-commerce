import { createFileRoute } from '@tanstack/react-router';
import { ShopSettings } from '@/views/shop-settings';

export const Route = createFileRoute('/dashboard/shop-settings')({
  component: ShopSettings,
});
