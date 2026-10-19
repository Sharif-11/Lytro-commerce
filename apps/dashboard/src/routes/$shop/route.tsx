import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { tenantSession } from '@/session/tenant-session';
import { ShopShell } from '@/components/layout/shop-shell';

// TEN-31: every dashboard screen lives under /<shop slug>. This one layout route does the session guard for
// all of them (ENGINEERING-STANDARDS §4); the shell checks that the slug is the signed-in person's shop and
// shows the same not-found for a stranger's slug as for an unknown one.
export const Route = createFileRoute('/$shop')({
  beforeLoad: async ({ params }) => {
    await tenantSession.whenReady();
    if (!tenantSession.isSignedIn()) {
      throw redirect({ to: '/sign-in', search: { shop: params.shop } });
    }
  },
  component: ShopLayout,
});

function ShopLayout(): React.JSX.Element {
  const { shop } = Route.useParams();
  return (
    <ShopShell slug={shop}>
      <Outlet />
    </ShopShell>
  );
}
