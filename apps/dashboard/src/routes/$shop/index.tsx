import { createFileRoute } from '@tanstack/react-router';
import { DashboardHome } from '@/views/dashboard-home';

// The first build's Home, framed by the new shell until Slice 11.4 rebuilds it.
export const Route = createFileRoute('/$shop/')({
  staticData: { screen: { hub: 'home', legacy: true } },
  component: DashboardHome,
});
