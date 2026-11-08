import { createFileRoute } from '@tanstack/react-router';
import { BellPage } from '@/views/notifications/bell-page';

// The bell's own page (§7.40, Part 37's `p37-bell-all`; NTF-01): the last 30 days, each person's own.
export const Route = createFileRoute('/$shop/notifications')({
  staticData: {
    screen: { hub: 'menu', title: 'ntTitle', back: '/$shop/menu' },
  },
  component: BellPage,
});
