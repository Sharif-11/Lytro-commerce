import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { STOCK_SEGMENTS } from '@/api/stock';
import { StockView } from '@/views/stock';

// TENANT-DASHBOARD-DESIGN §7.7: the Shop hub's Stock. The search and segment sit in the address, so Back from a sheet's
// product returns to the same list; `add` is the + menu's Add stock, which picks its product first (Part 20, v3.7).
export const Route = createFileRoute('/$shop/stock')({
  validateSearch: z.object({
    q: z.string().optional().catch(undefined),
    seg: z.enum(STOCK_SEGMENTS).optional().catch(undefined),
    add: z.coerce.number().optional().catch(undefined),
  }),
  staticData: { screen: { hub: 'shop', section: 'stock', title: 'secStock' } },
  component: StockRoute,
});

function StockRoute(): React.JSX.Element {
  const { q, seg, add } = Route.useSearch();
  return <StockView search={q ?? ''} segment={seg ?? 'all'} addAsked={add === 1} />;
}
