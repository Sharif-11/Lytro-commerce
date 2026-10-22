import { createFileRoute } from '@tanstack/react-router';
import { Team } from '@/views/team';

// The first build's screen, framed by the new shell until its own pull request of Slice 11 rebuilds it.
export const Route = createFileRoute('/$shop/team')({
  staticData: { screen: { hub: 'menu', section: 'team', title: 'secTeam', legacy: true } },
  component: Team,
});
