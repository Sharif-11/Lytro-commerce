import { createFileRoute } from '@tanstack/react-router';
import { RateKey } from '@lytronix/validators';
import { Rates } from '@/views/rates';

const KEYS: readonly string[] = Object.values(RateKey);

function isRateKey(value: unknown): value is RateKey {
  return typeof value === 'string' && KEYS.includes(value);
}

export const Route = createFileRoute('/_console/rates')({
  // NTC-13: a rate's history opened, as a published rate-change notice comes back to it.
  validateSearch: (search: Record<string, unknown>): { history?: RateKey } =>
    isRateKey(search.history) ? { history: search.history } : {},
  component: Rates,
});
