import { createFileRoute, redirect } from '@tanstack/react-router';

// The first build's Invoices is Billing now (TENANT-DASHBOARD-DESIGN §7.13); an old link lands there.
export const Route = createFileRoute('/$shop/invoices')({
  beforeLoad: ({ params }) => {
    throw redirect({ to: '/$shop/billing', params: { shop: params.shop } });
  },
});
