import { createFileRoute } from '@tanstack/react-router';
import { Roles } from '@/views/team/roles';

// The Roles segment of Team: a sibling route, not a child, so the People screen needs no Outlet.
export const Route = createFileRoute('/$shop/team_/roles')({
  component: Roles,
});
