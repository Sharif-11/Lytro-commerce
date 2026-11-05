import { createFileRoute } from '@tanstack/react-router';
import { Receipts } from '@/views/phones/receipts';

export const Route = createFileRoute('/_console/phones/receipts')({
  component: Receipts,
});
