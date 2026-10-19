import { createFileRoute } from '@tanstack/react-router';
import { Wallets } from '@/views/wallets';

export const Route = createFileRoute('/_console/wallets')({
  component: Wallets,
});
