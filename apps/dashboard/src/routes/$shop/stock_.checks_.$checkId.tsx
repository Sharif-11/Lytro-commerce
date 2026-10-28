import { createFileRoute } from '@tanstack/react-router';
import { CheckDetailView } from '@/views/stock-checks/check-detail';

// TENANT-DASHBOARD-DESIGN §7.8: one stock check, its number its title.
export const Route = createFileRoute('/$shop/stock_/checks_/$checkId')({
  staticData: {
    screen: { hub: 'shop', section: 'stock', title: 'stockChecks', back: '/$shop/stock/checks' },
  },
  component: CheckRoute,
});

function CheckRoute(): React.JSX.Element {
  const { checkId } = Route.useParams();
  return <CheckDetailView checkId={checkId} />;
}
