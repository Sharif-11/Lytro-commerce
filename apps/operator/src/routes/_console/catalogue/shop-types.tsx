import { createFileRoute } from '@tanstack/react-router';
import { ShopTypes } from '@/views/shop-types';

export const Route = createFileRoute('/_console/catalogue/shop-types')({
  component: ShopTypes,
});
