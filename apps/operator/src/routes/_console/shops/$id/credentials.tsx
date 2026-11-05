import { createFileRoute } from '@tanstack/react-router';
import { ShopCredentials } from '@/views/shop/credentials';

export const Route = createFileRoute('/_console/shops/$id/credentials')({
  component: ShopCredentials,
});
