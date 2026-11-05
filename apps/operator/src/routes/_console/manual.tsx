import { createFileRoute } from '@tanstack/react-router';
import { LaterPage } from '@/views/later';

export const Route = createFileRoute('/_console/manual')({
  component: () => <LaterPage page="manual" />,
});
