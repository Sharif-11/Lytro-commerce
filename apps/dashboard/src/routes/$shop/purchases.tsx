import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { PURCHASE_SEGMENTS } from '@/api/purchases';
import { PurchasesView } from '@/views/purchases';

// TENANT-DASHBOARD-DESIGN §7.21: the Shop hub's Purchases. The segment sits in the address, so Back from a purchase
// returns to the same list.
export const Route = createFileRoute('/$shop/purchases')({
  validateSearch: z.object({
    seg: z.enum(PURCHASE_SEGMENTS).optional().catch(undefined),
  }),
  staticData: { screen: { hub: 'shop', section: 'purchases', title: 'secPurchases' } },
  component: PurchasesRoute,
});

function PurchasesRoute(): React.JSX.Element {
  const { seg } = Route.useSearch();
  return <PurchasesView segment={seg ?? 'open'} />;
}
