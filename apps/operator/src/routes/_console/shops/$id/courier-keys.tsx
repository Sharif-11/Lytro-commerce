import { createFileRoute } from '@tanstack/react-router';
import { ShopCourierKeys } from '@/views/shop/courier-keys';

export const Route = createFileRoute('/_console/shops/$id/courier-keys')({
  component: ShopCourierKeys,
});
