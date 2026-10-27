import { createFileRoute } from '@tanstack/react-router';
import { MenuView } from '@/views/menu';

// TENANT-DASHBOARD-DESIGN §7.18: the Menu hub's own page.
export const Route = createFileRoute('/$shop/menu')({
  staticData: { screen: { hub: 'menu', title: 'hubMenu' } },
  component: MenuView,
});
