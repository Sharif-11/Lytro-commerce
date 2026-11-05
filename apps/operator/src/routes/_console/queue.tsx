import { createFileRoute } from '@tanstack/react-router';
import { Queue } from '@/views/queue';

export const Route = createFileRoute('/_console/queue')({
  component: Queue,
});
