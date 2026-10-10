import { createFileRoute } from '@tanstack/react-router';
import { DashboardHome } from '@/views/dashboard';

export const Route = createFileRoute('/dashboard/')({
  component: DashboardHome,
});
