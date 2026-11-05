import { createFileRoute } from '@tanstack/react-router';
import { Addons } from '@/views/addons';

export const Route = createFileRoute('/_console/addons')({
  component: Addons,
});
