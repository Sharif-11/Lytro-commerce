import { createFileRoute, Outlet, redirect, useNavigate } from '@tanstack/react-router';
import { useMutation } from '@tanstack/react-query';
import { operatorSession } from '@/session/operator-session';
import { OperatorShell } from '@/components/layout/operator-shell';

// A pathless layout (`_console`), not a `/operator` path layout like dashboard/route.tsx — operator/sign-in.tsx
// already lives under the `operator/` folder, so a path-based guard here would also wrap sign-in itself and
// redirect it to itself (an infinite loop). The underscore keeps this guard scoped to just its own children
// (plans, billing-terms, rates) without adding a URL segment.

export const Route = createFileRoute('/operator/_console')({
  beforeLoad: () => {
    if (!operatorSession.isSignedIn()) throw redirect({ to: '/operator/sign-in' });
  },
  component: OperatorLayout,
});

function OperatorLayout(): React.JSX.Element {
  const navigate = useNavigate();
  const signOut = useMutation({
    mutationFn: () => operatorSession.client.post<{ ok: true }>('/auth/operator/signout'),
    onSettled: () => {
      operatorSession.clear();
      void navigate({ to: '/operator/sign-in' });
    },
  });

  return (
    <OperatorShell
      onSignOut={() => {
        signOut.mutate();
      }}
      signOutPending={signOut.isPending}
    >
      <Outlet />
    </OperatorShell>
  );
}
