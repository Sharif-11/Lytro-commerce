import { createFileRoute, redirect } from '@tanstack/react-router';

// Customers joins the Orders hub with Phase 4 (TENANT-DASHBOARD-DESIGN §3); an old link lands on Orders.
export const Route = createFileRoute('/$shop/customers')({
  beforeLoad: ({ params }) => {
    throw redirect({ to: '/$shop/orders', params: { shop: params.shop } });
  },
});
