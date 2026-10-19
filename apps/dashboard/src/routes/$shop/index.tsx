import { createFileRoute } from '@tanstack/react-router';
import { DashboardHome } from '@/views/dashboard-home';

export const Route = createFileRoute('/$shop/')({
  component: DashboardHome,
});
