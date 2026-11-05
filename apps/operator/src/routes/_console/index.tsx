import { createFileRoute } from '@tanstack/react-router';
import { Today } from '@/views/today';

export const Route = createFileRoute('/_console/')({
  component: Today,
});
