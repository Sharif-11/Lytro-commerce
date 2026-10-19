import { createFileRoute } from '@tanstack/react-router';
import { Unavailable } from '@/views/unavailable';

export const Route = createFileRoute('/unavailable')({
  component: Unavailable,
});
