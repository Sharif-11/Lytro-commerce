import { createFileRoute } from '@tanstack/react-router';
import { Balance } from '@/views/balance';

export const Route = createFileRoute('/$shop/balance')({
  component: Balance,
});
