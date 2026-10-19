import { createFileRoute, redirect } from '@tanstack/react-router';
import { operatorSession } from '@/session/operator-session';
import { SignIn } from '@/views/sign-in';

export const Route = createFileRoute('/sign-in')({
  beforeLoad: () => {
    if (operatorSession.isSignedIn()) throw redirect({ to: '/payment-queue' });
  },
  component: SignIn,
});
