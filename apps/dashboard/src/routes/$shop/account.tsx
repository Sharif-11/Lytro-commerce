import { createFileRoute } from '@tanstack/react-router';
import { Account } from '@/views/account';

export const Route = createFileRoute('/$shop/account')({
  component: Account,
});
