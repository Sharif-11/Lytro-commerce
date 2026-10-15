import { createFileRoute } from '@tanstack/react-router';
import { OperatorTenants } from '@/views/operator/tenants';

export const Route = createFileRoute('/operator/_console/tenants')({
  component: OperatorTenants,
});
