import { createFileRoute } from '@tanstack/react-router';
import { RolesView } from '@/views/team/roles';

// The Roles half of Team: a sibling route, not a child, so the People screen needs no Outlet. Its back arrow leads to
// People, and it keeps the hub's section chips, as the prototype's `roles` draws.
export const Route = createFileRoute('/$shop/team_/roles')({
  staticData: { screen: { hub: 'menu', section: 'team', title: 'secTeam', back: '/$shop/team' } },
  component: RolesView,
});
