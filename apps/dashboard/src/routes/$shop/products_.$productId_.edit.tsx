import { createFileRoute } from '@tanstack/react-router';
import { ProductEditor } from '@/views/product';

// TENANT-DASHBOARD-DESIGN §7.4, §7.4c: editing one product, from its page's Edit; Save returns to the page. An archived
// product shows its own page here too (Part 13).
export const Route = createFileRoute('/$shop/products_/$productId_/edit')({
  staticData: {
    screen: {
      hub: 'shop',
      section: 'products',
      title: 'secProducts',
      back: '/$shop/products/$productId',
    },
  },
  component: EditRoute,
});

function EditRoute(): React.JSX.Element {
  const { productId } = Route.useParams();
  return <ProductEditor key={productId} productId={productId} />;
}
