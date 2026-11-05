import { createFileRoute } from '@tanstack/react-router';
import { HoldingPage } from '@/views/later';

export const Route = createFileRoute('/_console/page-reports')({
  component: () => <HoldingPage titleKey="nav.pageReports" />,
});
