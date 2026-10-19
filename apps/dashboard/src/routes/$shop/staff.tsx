import { createFileRoute } from '@tanstack/react-router';
import { Staff } from '@/views/staff';

export const Route = createFileRoute('/$shop/staff')({
  component: Staff,
});
