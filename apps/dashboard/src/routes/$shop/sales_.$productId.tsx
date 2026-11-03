import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { ProductTrend } from '@/views/sales/product-trend';

// TENANT-DASHBOARD-DESIGN §7.34: a product's trend, from Best sellers. Its name comes with it: someone who may read orders
// may not be able to read products.
export const Route = createFileRoute('/$shop/sales_/$productId')({
  validateSearch: z.object({ name: z.string().optional().catch(undefined) }),
  staticData: {
    screen: { hub: 'orders', section: 'sales', title: 'secSales', back: '/$shop/sales' },
  },
  component: TrendRoute,
});

function TrendRoute(): React.JSX.Element {
  return <ProductTrend productId={Route.useParams().productId} name={Route.useSearch().name} />;
}
