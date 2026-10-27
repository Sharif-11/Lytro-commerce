import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { IdentityKind } from '@lytronix/validators';
import { AccountView } from '@/views/account';

// TENANT-DASHBOARD-DESIGN §7.17: the Menu hub's Account section. `?connected=` is the provider a connect just added,
// back from its callback (AUTH-27).
export const Route = createFileRoute('/$shop/account')({
  validateSearch: z.object({ connected: z.nativeEnum(IdentityKind).optional().catch(undefined) }),
  staticData: { screen: { hub: 'menu', section: 'account', title: 'secAccount' } },
  component: AccountRoute,
});

function AccountRoute(): React.JSX.Element {
  const { connected } = Route.useSearch();
  return <AccountView connected={connected ?? null} />;
}
