import { createFileRoute } from '@tanstack/react-router';
import { DashboardPlaceholder } from '@/views/dashboard';

export const Route = createFileRoute('/dashboard/')({
  component: DashboardPlaceholder,
});
