import { createFileRoute } from '@tanstack/react-router';
import { Activity } from '@/views/activity';

// The first build's screen, framed by the new shell until its own pull request of Slice 11 rebuilds it.
export const Route = createFileRoute('/$shop/activity')({
  staticData: { screen: { hub: 'menu', section: 'activity', title: 'secActivity', legacy: true } },
  component: Activity,
});
