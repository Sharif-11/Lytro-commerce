import { createFileRoute } from '@tanstack/react-router';
import { Permission } from '@lytronix/validators';
import { NewCheckView } from '@/views/stock-checks/new-check';

// TENANT-DASHBOARD-DESIGN §7.8: a new stock check, from the list's New check; counting needs inventory:manage.
export const Route = createFileRoute('/$shop/stock_/checks_/new')({
  staticData: {
    screen: {
      hub: 'shop',
      section: 'stock',
      title: 'stockCheckNew',
      back: '/$shop/stock/checks',
      needs: [Permission.InventoryManage],
    },
  },
  component: NewCheckView,
});
