import { createFileRoute } from '@tanstack/react-router';
import { Permission } from '@lytronix/validators';
import { StockValueView } from '@/views/stock-value';

// TENANT-DASHBOARD-DESIGN §7.22: stock value and losses, below Stock, which its money figures open; costs need
// inventory:manage (D3-9).
export const Route = createFileRoute('/$shop/stock_/value')({
  staticData: {
    screen: {
      hub: 'shop',
      section: 'stock',
      title: 'stockValueTitle',
      back: '/$shop/stock',
      needs: [Permission.InventoryManage],
    },
  },
  component: StockValueView,
});
