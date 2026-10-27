import { createFileRoute } from '@tanstack/react-router';
import { TeamView } from '@/views/team';

// TENANT-DASHBOARD-DESIGN §7.14: the Menu hub's Team section, its People half.
export const Route = createFileRoute('/$shop/team')({
  staticData: { screen: { hub: 'menu', section: 'team', title: 'secTeam' } },
  component: TeamView,
});
