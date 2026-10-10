import { createFileRoute } from '@tanstack/react-router';
import { ComingSoon } from '@/components/coming-soon';

export const Route = createFileRoute('/dashboard/activity')({
  component: () => <ComingSoon titleKey="nav.activity" />,
});
