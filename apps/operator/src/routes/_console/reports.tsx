import { createFileRoute } from '@tanstack/react-router';
import { ConsumerMetric, SalesBucket } from '@lytronix/validators';
import { Reports, type ReportsSearch } from '@/views/reports';
import { PRESETS, type Preset } from '@/views/reports/period';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

const oneOf = <T extends string>(values: readonly T[], value: unknown): T | undefined =>
  values.find((each) => each === value);

export const Route = createFileRoute('/_console/reports')({
  // ADM-09 (§10e): which report, which days and how they are split, so a link opens the same figures.
  validateSearch: (search: Record<string, unknown>): ReportsSearch => {
    const view = oneOf(['shops', 'consumers'] as const, search.view);
    const preset = oneOf<Preset>(PRESETS, search.preset);
    const split = oneOf(Object.values(SalesBucket), search.split);
    const metric = oneOf(Object.values(ConsumerMetric), search.metric);
    const from = typeof search.from === 'string' && DAY.test(search.from) ? search.from : undefined;
    const to = typeof search.to === 'string' && DAY.test(search.to) ? search.to : undefined;
    return {
      ...(view ? { view } : {}),
      ...(preset ? { preset } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      ...(split ? { split } : {}),
      ...(metric ? { metric } : {}),
    };
  },
  component: Reports,
});
