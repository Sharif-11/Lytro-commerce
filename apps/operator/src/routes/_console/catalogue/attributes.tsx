import { createFileRoute } from '@tanstack/react-router';
import { HoldingPage } from '@/views/later';

export const Route = createFileRoute('/_console/catalogue/attributes')({
  component: () => <HoldingPage titleKey="nav.attributes" />,
});
