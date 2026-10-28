import { createFileRoute } from '@tanstack/react-router';
import { StockChecksView } from '@/views/stock-checks';

// TENANT-DASHBOARD-DESIGN §7.8: the shop's stock checks, below Stock, which its Check stock opens (design v3.8).
export const Route = createFileRoute('/$shop/stock_/checks')({
  staticData: {
    screen: { hub: 'shop', section: 'stock', title: 'stockChecks', back: '/$shop/stock' },
  },
  component: StockChecksView,
});
