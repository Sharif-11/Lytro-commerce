import { createFileRoute } from '@tanstack/react-router';
import { PaymentPanel, type PaymentStep } from '@/views/queue/payment-panel';

const STEPS: readonly string[] = ['approve', 'reject', 'credit'];

export const Route = createFileRoute('/_console/queue/$id')({
  validateSearch: (search: Record<string, unknown>): { step?: PaymentStep } =>
    typeof search.step === 'string' && STEPS.includes(search.step)
      ? { step: search.step as PaymentStep }
      : {},
  component: PaymentPanel,
});
