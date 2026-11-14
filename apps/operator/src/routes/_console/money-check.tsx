import { createFileRoute } from '@tanstack/react-router';
import { MoneyCheck } from '@/views/money-check';

export const Route = createFileRoute('/_console/money-check')({
  component: MoneyCheck,
});
