import { createFileRoute } from '@tanstack/react-router';
import { TutorialsView } from '@/views/tutorials';

// Menu › টিউটোরিয়াল (§7.49, the prototype's `tv-list`): the whole series in order, for everyone on the team. The app bar
// says Menu, where it goes back to; the page's own title says Tutorials.
export const Route = createFileRoute('/$shop/tutorials')({
  staticData: {
    screen: { hub: 'menu', title: 'hubMenu', deskTitle: 'tutorials:title', back: '/$shop/menu' },
  },
  component: TutorialsView,
});
