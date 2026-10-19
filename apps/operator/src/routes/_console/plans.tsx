import { createFileRoute } from '@tanstack/react-router';
import { Plans } from '@/views/plans';

export const Route = createFileRoute('/_console/plans')({
  component: Plans,
});
