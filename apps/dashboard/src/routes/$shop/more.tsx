import { createFileRoute, redirect } from '@tanstack/react-router';

// The first build's "More" is the Menu hub now (TENANT-DASHBOARD-DESIGN §3); an old link lands there.
export const Route = createFileRoute('/$shop/more')({
  beforeLoad: ({ params }) => {
    throw redirect({ to: '/$shop/menu', params: { shop: params.shop } });
  },
});
