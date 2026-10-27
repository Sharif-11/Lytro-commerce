import { createFileRoute } from '@tanstack/react-router';
import { ProductEditor } from '@/views/product';

// TENANT-DASHBOARD-DESIGN §7.4: a new product, from Add product, the + menu or Home's checklist.
export const Route = createFileRoute('/$shop/products_/new')({
  staticData: {
    screen: { hub: 'shop', section: 'products', title: 'secProducts', back: '/$shop/products' },
  },
  component: () => <ProductEditor productId={null} />,
});
