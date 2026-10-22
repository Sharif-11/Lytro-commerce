import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { Permission } from '@lytronix/validators';
import { Search } from '@/views/search';

// TENANT-DASHBOARD-DESIGN §4.4: search, for whoever may read products, until orders and customers join it.
export const Route = createFileRoute('/$shop/search')({
  validateSearch: z.object({ q: z.string().catch('').default('') }),
  staticData: {
    screen: { hub: 'home', title: 'search', back: '/$shop', needs: [Permission.ProductsRead] },
  },
  component: SearchRoute,
});

function SearchRoute(): React.JSX.Element {
  const { q } = Route.useSearch();
  return <Search query={q} />;
}
