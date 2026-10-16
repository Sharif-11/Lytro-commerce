import { createFileRoute, redirect } from '@tanstack/react-router';

// The console's bare landing has nothing of its own to show yet (D2-9's scope is just the three editors) —
// go straight to the first one rather than adding an empty intermediate page.
export const Route = createFileRoute('/operator/_console/')({
  beforeLoad: () => {
    throw redirect({ to: '/operator/plans' });
  },
});
