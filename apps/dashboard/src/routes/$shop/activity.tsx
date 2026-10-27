import { createFileRoute } from '@tanstack/react-router';
import { ActivityView } from '@/views/activity';

// TENANT-DASHBOARD-DESIGN §7.15: the Menu hub's Activity section.
export const Route = createFileRoute('/$shop/activity')({
  staticData: { screen: { hub: 'menu', section: 'activity', title: 'secActivity' } },
  component: ActivityView,
});
