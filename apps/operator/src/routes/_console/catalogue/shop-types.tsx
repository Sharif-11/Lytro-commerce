import { createFileRoute } from '@tanstack/react-router';
import { HoldingPage } from '@/views/later';

export const Route = createFileRoute('/_console/catalogue/shop-types')({
  component: () => <HoldingPage titleKey="nav.shopTypes" />,
});
