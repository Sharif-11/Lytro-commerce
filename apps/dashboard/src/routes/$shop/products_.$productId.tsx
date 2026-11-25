import { createFileRoute } from '@tanstack/react-router';
import { ProductPage } from '@/views/product-page';

// TENANT-DASHBOARD-DESIGN §7.4c (the owner, 2026-11-25): a product opens its page for the seller -- what it is, how it
// sells, and Edit, Share and more; an archived one shows its own page (Part 13). The editor is at .../edit.
export const Route = createFileRoute('/$shop/products_/$productId')({
  staticData: {
    screen: { hub: 'shop', section: 'products', title: 'secProducts', back: '/$shop/products' },
  },
  component: ProductRoute,
});

function ProductRoute(): React.JSX.Element {
  const { productId } = Route.useParams();
  return <ProductPage key={productId} productId={productId} />;
}
