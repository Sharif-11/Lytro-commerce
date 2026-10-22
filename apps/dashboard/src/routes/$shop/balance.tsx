import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { Balance } from '@/views/balance';

// The first build's Balance, framed by the new shell until Slice 11.5 rebuilds it. ?topup=1 opens the top-up
// sheet, for the + menu's Top up (TENANT-DASHBOARD-DESIGN §4.5).
export const Route = createFileRoute('/$shop/balance')({
  validateSearch: z.object({ topup: z.coerce.number().optional().catch(undefined) }),
  staticData: { screen: { hub: 'money', section: 'balance', title: 'secBalance', legacy: true } },
  component: BalanceRoute,
});

function BalanceRoute(): React.JSX.Element {
  const { topup } = Route.useSearch();
  return <Balance openTopUp={topup === 1} />;
}
