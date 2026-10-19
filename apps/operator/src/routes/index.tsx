import { createFileRoute, redirect } from '@tanstack/react-router';
import { operatorSession } from '@/session/operator-session';

// admin.lytro.app/: a signed-in operator lands on the payment queue, anyone else on sign-in.
export const Route = createFileRoute('/')({
  beforeLoad: () => {
    throw redirect({ to: operatorSession.isSignedIn() ? '/payment-queue' : '/sign-in' });
  },
});
