import { createFileRoute } from '@tanstack/react-router';
import { StaffSignIn } from '@/views/staff-sign-in';

export const Route = createFileRoute('/staff-sign-in')({
  component: StaffSignIn,
});
