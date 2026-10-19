import { createFileRoute } from '@tanstack/react-router';
import { PaymentQueue } from '@/views/payment-queue';

export const Route = createFileRoute('/_console/payment-queue')({
  component: PaymentQueue,
});
