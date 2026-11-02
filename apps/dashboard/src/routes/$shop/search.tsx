import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { SEARCH_NEEDS } from '@/shell/hubs';
import { Search } from '@/views/search';

// TENANT-DASHBOARD-DESIGN §7.32: the one search, for whoever may read orders, customers or products.
export const Route = createFileRoute('/$shop/search')({
  validateSearch: z.object({ q: z.string().catch('').default('') }),
  staticData: { screen: { hub: 'home', title: 'search', back: '/$shop', needs: SEARCH_NEEDS } },
  component: SearchRoute,
});

function SearchRoute(): React.JSX.Element {
  const { q } = Route.useSearch();
  return <Search query={q} />;
}
