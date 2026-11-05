import { createFileRoute } from '@tanstack/react-router';
import { Tenants } from '@/views/tenants';

export const Route = createFileRoute('/_console/tenants')({
  // What the top bar's search was sent with (OPERATOR-CONSOLE-DESIGN rule 7).
  validateSearch: (search: Record<string, unknown>): { q?: string } =>
    typeof search.q === 'string' ? { q: search.q } : {},
  component: Tenants,
});
