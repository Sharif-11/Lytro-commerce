import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { BalanceView } from '@/views/balance';

// TENANT-DASHBOARD-DESIGN §7.11: Balance. ?topup=1 opens the top-up sheet, for the + menu's Top up (§4.5); a suspended
// shop's owner reaches it without the shell (LIF-24). PAYG-FAIR-USE-PLAN PF-41: &amount= opens it on that amount -- the
// activation prompt's ৳10.
export const Route = createFileRoute('/$shop/balance')({
  validateSearch: z.object({
    topup: z.coerce.number().optional().catch(undefined),
    amount: z.coerce.number().optional().catch(undefined),
  }),
  staticData: { screen: { hub: 'money', section: 'balance', title: 'secBalance' } },
  component: BalanceRoute,
});

function BalanceRoute(): React.JSX.Element {
  const { topup, amount } = Route.useSearch();
  return <BalanceView openTopUp={topup === 1} opensOn={amount} />;
}
