import { createFileRoute } from '@tanstack/react-router';
import { Roles } from '@/views/team/roles';

// The Roles segment of Team: a sibling route, not a child, so the People screen needs no Outlet. The first build's,
// framed by the new shell until Slice 11.6 rebuilds it.
export const Route = createFileRoute('/$shop/team_/roles')({
  staticData: {
    screen: { hub: 'menu', section: 'team', title: 'secTeam', back: '/$shop/team', legacy: true },
  },
  component: Roles,
});
