import { createFileRoute } from '@tanstack/react-router';
import { Renew } from '@/views/renew';

// TENANT-DASHBOARD-DESIGN §7.20: a locked or archived shop's one page, without the shell (LIF-11, LIF-12); the shell
// sends such a shop here from any other path, and Renew sends any other shop to Plan.
export const Route = createFileRoute('/$shop/renew')({
  staticData: { screen: { hub: 'money', section: 'plan' } },
  component: Renew,
});
