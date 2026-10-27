import { createFileRoute } from '@tanstack/react-router';
import { UsageView } from '@/views/usage';

// TENANT-DASHBOARD-DESIGN §7.24: Usage, every limit against its use (LIM-01, LIM-02).
export const Route = createFileRoute('/$shop/usage')({
  staticData: { screen: { hub: 'money', section: 'usage', title: 'secUsage' } },
  component: UsageView,
});
