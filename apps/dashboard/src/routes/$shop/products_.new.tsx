import { createFileRoute } from '@tanstack/react-router';
import { Arriving } from '@/views/arriving';

// TENANT-DASHBOARD-DESIGN §7.4: a new product; its editor is the next part of Slice 11.7a.
export const Route = createFileRoute('/$shop/products_/new')({
  staticData: {
    screen: { hub: 'shop', section: 'products', title: 'secProducts', back: '/$shop/products' },
  },
  component: () => <Arriving icon="tag" />,
});
