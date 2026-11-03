import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { SalesBucket, SalesRanking } from '@lytronix/validators';
import { PERIOD_KEYS } from '@/lib/sales-period';
import { SalesScreen } from '@/views/sales';

// TENANT-DASHBOARD-DESIGN §7.34: the Orders hub's Sales. The period and the split sit in the address, so Back returns to
// the same view.
export const Route = createFileRoute('/$shop/sales')({
  validateSearch: z.object({
    period: z.enum(PERIOD_KEYS).optional().catch(undefined),
    from: z.string().optional().catch(undefined),
    to: z.string().optional().catch(undefined),
    bucket: z.nativeEnum(SalesBucket).optional().catch(undefined),
    by: z.nativeEnum(SalesRanking).optional().catch(undefined),
  }),
  staticData: { screen: { hub: 'orders', section: 'sales', title: 'secSales' } },
  component: SalesRoute,
});

function SalesRoute(): React.JSX.Element {
  return <SalesScreen search={Route.useSearch()} />;
}
