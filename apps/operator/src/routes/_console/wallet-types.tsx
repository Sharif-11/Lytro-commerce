import { createFileRoute } from '@tanstack/react-router';
import { WalletTypes } from '@/views/wallet-types';

export const Route = createFileRoute('/_console/wallet-types')({
  component: WalletTypes,
});
