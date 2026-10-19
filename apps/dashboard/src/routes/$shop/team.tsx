import { createFileRoute } from '@tanstack/react-router';
import { Team } from '@/views/team';

export const Route = createFileRoute('/$shop/team')({
  component: Team,
});
