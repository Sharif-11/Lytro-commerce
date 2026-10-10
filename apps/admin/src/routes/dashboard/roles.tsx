import { createFileRoute } from '@tanstack/react-router';
import { ComingSoon } from '@/components/coming-soon';

export const Route = createFileRoute('/dashboard/roles')({
  component: () => <ComingSoon titleKey="nav.roles" />,
});
