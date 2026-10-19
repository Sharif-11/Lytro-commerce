import { createFileRoute } from '@tanstack/react-router';
import { Activity } from '@/views/activity';

export const Route = createFileRoute('/$shop/activity')({
  component: Activity,
});
