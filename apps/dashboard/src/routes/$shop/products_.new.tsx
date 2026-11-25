import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { ProductEditor } from '@/views/product';

// TENANT-DASHBOARD-DESIGN §7.4: a new product, from Add product, the + menu or Home's checklist. §7.4b: ?first=1 is a
// brand-new shop's first landing, from the last onboarding step (`pq-first`).
export const Route = createFileRoute('/$shop/products_/new')({
  staticData: {
    // On a desktop the header names it, as drawn (`pf-*`); on a phone the bar keeps the section.
    screen: {
      hub: 'shop',
      section: 'products',
      title: 'secProducts',
      deskTitle: 'shop:newProduct',
      back: '/$shop/products',
    },
  },
  validateSearch: z.object({ first: z.coerce.number().optional().catch(undefined) }),
  component: NewProductRoute,
});

function NewProductRoute(): React.JSX.Element {
  const { first } = Route.useSearch();
  return <ProductEditor productId={null} first={first === 1} />;
}
