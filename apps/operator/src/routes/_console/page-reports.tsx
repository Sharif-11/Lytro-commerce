import { createFileRoute } from '@tanstack/react-router';
import { PageReports } from '@/views/page-reports';

export const Route = createFileRoute('/_console/page-reports')({
  validateSearch: (search: Record<string, unknown>): { view?: 'handled' } =>
    search.view === 'handled' ? { view: 'handled' } : {},
  component: PageReports,
});
