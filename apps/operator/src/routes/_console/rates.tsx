import { createFileRoute } from '@tanstack/react-router';
import { Rates } from '@/views/rates';

export const Route = createFileRoute('/_console/rates')({
  component: Rates,
});
