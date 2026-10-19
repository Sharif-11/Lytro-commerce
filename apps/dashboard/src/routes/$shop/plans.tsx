import { createFileRoute } from '@tanstack/react-router';
import { Plans } from '@/views/plans';

// TRL-08's "see plans", and the renewal screen for a locked or archived shop (LIF-11, LIF-15).
export const Route = createFileRoute('/$shop/plans')({
  component: Plans,
});
