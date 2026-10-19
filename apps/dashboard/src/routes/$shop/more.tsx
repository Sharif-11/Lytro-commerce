import { createFileRoute } from '@tanstack/react-router';
import { More } from '@/views/more';

export const Route = createFileRoute('/$shop/more')({
  component: More,
});
