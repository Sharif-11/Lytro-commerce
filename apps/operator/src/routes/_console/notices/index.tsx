import { createFileRoute } from '@tanstack/react-router';
import { Notices } from '@/views/notices';

export const Route = createFileRoute('/_console/notices/')({
  component: Notices,
});
