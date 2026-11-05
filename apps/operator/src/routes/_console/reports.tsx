import { createFileRoute } from '@tanstack/react-router';
import { LaterPage } from '@/views/later';

export const Route = createFileRoute('/_console/reports')({
  component: () => <LaterPage page="reports" />,
});
