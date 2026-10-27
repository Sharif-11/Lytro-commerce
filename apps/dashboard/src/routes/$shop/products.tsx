import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { PRODUCT_SEGMENTS } from '@/lib/product-segments';
import { ProductsView } from '@/views/products';

// TENANT-DASHBOARD-DESIGN §7.3: the Shop hub's Products. The search, segment and category sit in the address, so Back
// from a product returns to the same list; `limit` is Add product refused before typing (Part 13's `products-limit-now`).
export const Route = createFileRoute('/$shop/products')({
  validateSearch: z.object({
    q: z.string().optional().catch(undefined),
    seg: z.enum(PRODUCT_SEGMENTS).optional().catch(undefined),
    cat: z.string().min(1).optional().catch(undefined),
    limit: z.literal(true).optional().catch(undefined),
  }),
  staticData: { screen: { hub: 'shop', section: 'products', title: 'secProducts' } },
  component: ProductsRoute,
});

function ProductsRoute(): React.JSX.Element {
  const { q, seg, cat, limit } = Route.useSearch();
  return (
    <ProductsView
      search={q ?? ''}
      segment={seg ?? 'all'}
      categoryId={cat ?? null}
      limitAsked={limit ?? false}
    />
  );
}
