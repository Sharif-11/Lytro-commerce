import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { ExpiringView } from '@/views/expiring';

// TENANT-DASHBOARD-DESIGN §7.9: the batches expiring and expired, below Stock, which its Expiring figure opens.
export const Route = createFileRoute('/$shop/stock_/expiring')({
  validateSearch: z.object({ seg: z.literal('expired').optional().catch(undefined) }),
  staticData: {
    screen: { hub: 'shop', section: 'stock', title: 'stockExpiring', back: '/$shop/stock' },
  },
  component: ExpiringRoute,
});

function ExpiringRoute(): React.JSX.Element {
  const { seg } = Route.useSearch();
  return <ExpiringView segment={seg ?? 'expiring'} />;
}
