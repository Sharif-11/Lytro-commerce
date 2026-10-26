import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { BalanceView } from '@/views/balance';

// TENANT-DASHBOARD-DESIGN §7.11: Balance. ?topup=1 opens the top-up sheet, for the + menu's Top up (§4.5); a suspended
// shop's owner reaches it without the shell (LIF-24).
export const Route = createFileRoute('/$shop/balance')({
  validateSearch: z.object({ topup: z.coerce.number().optional().catch(undefined) }),
  staticData: { screen: { hub: 'money', section: 'balance', title: 'secBalance' } },
  component: BalanceRoute,
});

function BalanceRoute(): React.JSX.Element {
  const { topup } = Route.useSearch();
  return <BalanceView openTopUp={topup === 1} />;
}
