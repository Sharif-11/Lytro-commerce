import { createFileRoute } from '@tanstack/react-router';
import { Staff } from '@/views/staff';

export const Route = createFileRoute('/dashboard/staff')({
  component: Staff,
});
