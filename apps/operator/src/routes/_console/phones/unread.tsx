import { createFileRoute } from '@tanstack/react-router';
import { Unread } from '@/views/phones/unread';

export const Route = createFileRoute('/_console/phones/unread')({
  component: Unread,
});
