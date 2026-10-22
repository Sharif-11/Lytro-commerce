import { createFileRoute } from '@tanstack/react-router';
import { More } from '@/views/more';

// TENANT-DASHBOARD-DESIGN §7.18: the Menu hub's own page -- the first build's, framed by the new shell until Slice
// 11.6 rebuilds it.
export const Route = createFileRoute('/$shop/menu')({
  staticData: { screen: { hub: 'menu', title: 'hubMenu', legacy: true } },
  component: More,
});
