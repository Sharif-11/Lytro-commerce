import { createFileRoute } from '@tanstack/react-router';
import { Roles } from '@/views/roles';

export const Route = createFileRoute('/dashboard/roles')({
  component: Roles,
});
