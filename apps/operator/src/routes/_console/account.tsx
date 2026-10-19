import { createFileRoute } from '@tanstack/react-router';
import { Account } from '@/views/account';

export const Route = createFileRoute('/_console/account')({
  component: Account,
});
