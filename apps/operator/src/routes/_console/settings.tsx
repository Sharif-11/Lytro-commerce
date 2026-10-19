import { createFileRoute } from '@tanstack/react-router';
import { Settings } from '@/views/settings';

export const Route = createFileRoute('/_console/settings')({
  component: Settings,
});
