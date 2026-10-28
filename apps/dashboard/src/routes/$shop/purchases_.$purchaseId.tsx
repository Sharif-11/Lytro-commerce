import { createFileRoute } from '@tanstack/react-router';
import { PurchaseView } from '@/views/purchases/purchase-page';

// TENANT-DASHBOARD-DESIGN §7.21: one purchase, its number (or Draft) its title.
export const Route = createFileRoute('/$shop/purchases_/$purchaseId')({
  staticData: {
    screen: { hub: 'shop', section: 'purchases', title: 'secPurchases', back: '/$shop/purchases' },
  },
  component: PurchaseRoute,
});

function PurchaseRoute(): React.JSX.Element {
  const { purchaseId } = Route.useParams();
  return <PurchaseView purchaseId={purchaseId} />;
}
