import { createFileRoute } from '@tanstack/react-router';
import { HoldingPage } from '@/views/later';

export const Route = createFileRoute('/_console/catalogue/option-sets')({
  component: () => <HoldingPage titleKey="nav.optionSets" />,
});
