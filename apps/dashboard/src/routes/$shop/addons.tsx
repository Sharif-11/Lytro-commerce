import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { AddonsView } from '@/views/addons';

// TENANT-DASHBOARD-DESIGN §7.25: Add-ons, below Usage. ?buy=<key> opens an add-on's Buy sheet and ?pack=bandwidth or
// ?pack=requests the pack sheet (agreed for Slice 11.5c), for Usage's links and the Plan and pay-as-you-go cards.
export const Route = createFileRoute('/$shop/addons')({
  validateSearch: z.object({
    buy: z.string().optional().catch(undefined),
    pack: z.enum(['bandwidth', 'requests']).optional().catch(undefined),
  }),
  staticData: {
    screen: { hub: 'money', section: 'usage', title: 'aoTitle', back: '/$shop/usage' },
  },
  component: AddonsRoute,
});

function AddonsRoute(): React.JSX.Element {
  const { buy, pack } = Route.useSearch();
  return <AddonsView buy={buy ?? null} pack={pack ?? null} />;
}
