import { createFileRoute } from '@tanstack/react-router';
import { Balance } from '@/views/balance';

export const Route = createFileRoute('/dashboard/balance')({
  component: Balance,
});
