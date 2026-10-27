import { createFileRoute } from '@tanstack/react-router';
import { ProductEditor } from '@/views/product';

// TENANT-DASHBOARD-DESIGN §7.4: one product, or an archived one's own page (Part 13).
export const Route = createFileRoute('/$shop/products_/$productId')({
  staticData: {
    screen: { hub: 'shop', section: 'products', title: 'secProducts', back: '/$shop/products' },
  },
  component: ProductRoute,
});

function ProductRoute(): React.JSX.Element {
  const { productId } = Route.useParams();
  return <ProductEditor key={productId} productId={productId} />;
}
