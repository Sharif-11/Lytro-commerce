import { createFileRoute } from '@tanstack/react-router';
import { ForgotPassword } from '@/views/forgot-password';

export const Route = createFileRoute('/forgot-password/')({
  component: ForgotPassword,
});
