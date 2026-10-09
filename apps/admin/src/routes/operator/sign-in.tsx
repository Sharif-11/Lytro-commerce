import { createFileRoute } from '@tanstack/react-router';
import { OperatorSignIn } from '@/views/operator/sign-in';

export const Route = createFileRoute('/operator/sign-in')({
  component: OperatorSignIn,
});
