import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { SuppliersView } from '@/views/suppliers';

// TENANT-DASHBOARD-DESIGN §7.21: the shop's suppliers, below Purchases; `archived` shows the archived ones (PUR-01).
export const Route = createFileRoute('/$shop/purchases_/suppliers')({
  validateSearch: z.object({
    archived: z.coerce.number().optional().catch(undefined),
  }),
  staticData: {
    screen: {
      hub: 'shop',
      section: 'purchases',
      title: 'suppliersTitle',
      back: '/$shop/purchases',
    },
  },
  component: SuppliersRoute,
});

function SuppliersRoute(): React.JSX.Element {
  const { archived } = Route.useSearch();
  return <SuppliersView archived={archived === 1} />;
}
