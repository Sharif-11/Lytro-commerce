import { createFileRoute } from '@tanstack/react-router';
import { NewCheckView } from '@/views/stock-checks/new-check';

// TENANT-DASHBOARD-DESIGN §7.8: a new stock check, from the list's New check.
export const Route = createFileRoute('/$shop/stock_/checks_/new')({
  staticData: {
    screen: { hub: 'shop', section: 'stock', title: 'stockCheckNew', back: '/$shop/stock/checks' },
  },
  component: NewCheckView,
});
