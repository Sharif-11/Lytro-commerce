import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { ConsoleShell } from '@/components/layout/console-shell';
import { operatorSession } from '@/session/operator-session';

// The pathless layout every console screen sits under: one session guard for all of them, then the shell.
export const Route = createFileRoute('/_console')({
  beforeLoad: () => {
    if (!operatorSession.isSignedIn()) throw redirect({ to: '/sign-in' });
  },
  component: () => (
    <ConsoleShell>
      <Outlet />
    </ConsoleShell>
  ),
});
