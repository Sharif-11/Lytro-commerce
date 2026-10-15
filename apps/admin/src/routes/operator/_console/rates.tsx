import { createFileRoute } from '@tanstack/react-router';
import { OperatorRates } from '@/views/operator/rates';

export const Route = createFileRoute('/operator/_console/rates')({
  component: OperatorRates,
});
