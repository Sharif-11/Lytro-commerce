import { createFileRoute } from '@tanstack/react-router';
import { NoticeBoardView } from '@/views/notices/board';

// Lytro's notices (§7.40, Part 37's `p37-notices`; NTC-03): the board, for the owner and staff with notices:read.
export const Route = createFileRoute('/$shop/notices')({
  staticData: {
    screen: { hub: 'menu', section: 'notices', title: 'secNotices' },
  },
  component: NoticeBoardView,
});
