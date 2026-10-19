import { createFileRoute } from '@tanstack/react-router';
import { Tenants } from '@/views/tenants';

export const Route = createFileRoute('/_console/tenants')({
  component: Tenants,
});
